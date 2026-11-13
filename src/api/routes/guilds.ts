import {
  ChannelType,
  PermissionFlagsBits,
  PermissionsBitField,
  type Guild,
} from "discord.js";
import { and, count, eq, gte } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { client } from "../../bot/client.js";
import { config } from "../../config.js";
import { db, schema } from "../../db/index.js";
import { fetchUserGuilds, requireUser } from "../auth.js";
import { ctx } from "../guard.js";
import type { ApiChannel, ApiGuildOverview, ApiGuildSummary, ApiRole } from "../types.js";

/** Permissions the bot needs for every feature. Used in the invite link and the overview warning. */
export const REQUIRED_BOT_PERMISSIONS = new PermissionsBitField([
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageNicknames,
  PermissionFlagsBits.ManageThreads,
  PermissionFlagsBits.CreatePrivateThreads,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ViewAuditLog,
]);

const MANAGE_GUILD = BigInt(PermissionFlagsBits.ManageGuild);
const ADMINISTRATOR = BigInt(PermissionFlagsBits.Administrator);

export const inviteUrl = (guildId?: string): string => {
  const params = new URLSearchParams({
    client_id: config.discordClientId,
    scope: "bot applications.commands",
    permissions: REQUIRED_BOT_PERMISSIONS.bitfield.toString(),
  });
  if (guildId) {
    params.set("guild_id", guildId);
    params.set("disable_guild_select", "true");
  }
  return `https://discord.com/oauth2/authorize?${params}`;
};

const channelTypeName = (type: ChannelType): ApiChannel["type"] => {
  switch (type) {
    case ChannelType.GuildText:
      return "text";
    case ChannelType.GuildAnnouncement:
      return "announcement";
    case ChannelType.GuildVoice:
    case ChannelType.GuildStageVoice:
      return "voice";
    case ChannelType.GuildCategory:
      return "category";
    case ChannelType.GuildForum:
      return "forum";
    default:
      return "other";
  }
};

function overview(guild: Guild): ApiGuildOverview {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const caseCounts = db
    .select({ type: schema.modCases.type, value: count() })
    .from(schema.modCases)
    .where(and(eq(schema.modCases.guildId, guild.id), gte(schema.modCases.createdAt, weekAgo)))
    .groupBy(schema.modCases.type)
    .all();
  const openTickets =
    db
      .select({ value: count() })
      .from(schema.tickets)
      .where(and(eq(schema.tickets.guildId, guild.id), eq(schema.tickets.status, "open")))
      .get()?.value ?? 0;
  const rankedMembers =
    db.select({ value: count() }).from(schema.memberLevels).where(eq(schema.memberLevels.guildId, guild.id)).get()
      ?.value ?? 0;

  const me = guild.members.me;
  const administrator = me?.permissions.has(PermissionFlagsBits.Administrator) ?? false;
  const missing = me && !administrator ? me.permissions.missing(REQUIRED_BOT_PERMISSIONS) : [];

  return {
    id: guild.id,
    name: guild.name,
    iconUrl: guild.iconURL({ size: 128 }),
    memberCount: guild.memberCount,
    channelCount: guild.channels.cache.size,
    roleCount: guild.roles.cache.size,
    openTickets,
    rankedMembers,
    casesLast7Days: Object.fromEntries(caseCounts.map((row) => [row.type, row.value])),
    botPermissions: { administrator, missing },
  };
}

/** Routes that are not scoped to one guild. */
export async function guildListRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/guilds", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;

    const guilds = await fetchUserGuilds(user);
    const manageable: ApiGuildSummary[] = guilds
      .filter(
        (g) =>
          g.owner ||
          (BigInt(g.permissions) & MANAGE_GUILD) === MANAGE_GUILD ||
          (BigInt(g.permissions) & ADMINISTRATOR) === ADMINISTRATOR,
      )
      .map((g) => {
        const botPresent = client.guilds.cache.has(g.id);
        return {
          id: g.id,
          name: g.name,
          iconUrl: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128` : null,
          botPresent,
          inviteUrl: botPresent ? null : inviteUrl(g.id),
        };
      })
      .sort((a, b) => Number(b.botPresent) - Number(a.botPresent) || a.name.localeCompare(b.name));
    return manageable;
  });

  app.get("/api/invite", async () => ({ url: inviteUrl() }));
}

/** Guild-scoped read-only data. Registered inside the guarded plugin. */
export async function guildInfoRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async (request) => overview(ctx(request).guild));

  app.get("/channels", async (request): Promise<ApiChannel[]> =>
    [...ctx(request).guild.channels.cache.values()]
      .filter((c) => !c.isThread())
      .map((c) => ({
        id: c.id,
        name: c.name,
        type: channelTypeName(c.type),
        parentId: c.parentId,
        position: "rawPosition" in c ? c.rawPosition : 0,
      }))
      .sort((a, b) => a.position - b.position),
  );

  app.get("/roles", async (request): Promise<ApiRole[]> => {
    const { guild } = ctx(request);
    const me = guild.members.me;
    return [...guild.roles.cache.values()]
      .filter((role) => role.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .map((role) => ({
        id: role.id,
        name: role.name,
        color: role.hexColor,
        position: role.position,
        managed: role.managed,
        assignable: !!me && !role.managed && role.comparePositionTo(me.roles.highest) < 0,
      }));
  });
}
