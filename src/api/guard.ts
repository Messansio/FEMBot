import { PermissionFlagsBits, type Guild, type GuildMember } from "discord.js";
import type { FastifyReply, FastifyRequest } from "fastify";
import { client } from "../bot/client.js";
import { config } from "../config.js";
import { db, schema } from "../db/index.js";
import { requireUser, type SessionUser } from "./auth.js";

export interface GuildContext {
  guild: Guild;
  member: GuildMember;
  user: SessionUser;
}

declare module "fastify" {
  interface FastifyRequest {
    guildContext: GuildContext | null;
  }
}

/**
 * preHandler for every /api/guilds/:guildId/* route.
 * Permissions are re-checked against the bot's live view of the guild on every request,
 * so revoked permissions take effect immediately.
 */
export async function requireGuildManager(
  request: FastifyRequest<{ Params: { guildId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const user = requireUser(request, reply);
  if (!user) return;

  const guild = client.guilds.cache.get(request.params.guildId);
  if (!guild) {
    await reply.code(404).send({ error: "The bot is not in this server." });
    return;
  }

  const member = await guild.members.fetch(user.id).catch(() => null);
  const allowed =
    member &&
    (guild.ownerId === user.id ||
      member.permissions.has(PermissionFlagsBits.ManageGuild) ||
      config.ownerIds.includes(user.id));
  if (!member || !allowed) {
    await reply.code(403).send({ error: "You need the Manage Server permission in this server." });
    return;
  }

  request.guildContext = { guild, member, user };
}

/** Narrowing helper for route handlers that run after `requireGuildManager`. */
export function ctx(request: FastifyRequest): GuildContext {
  if (!request.guildContext) throw new Error("Guild context missing: requireGuildManager not applied");
  return request.guildContext;
}

export function audit(context: GuildContext, action: string, details?: Record<string, unknown>): void {
  db.insert(schema.dashboardAudit)
    .values({
      guildId: context.guild.id,
      userId: context.user.id,
      userTag: context.member.user.tag,
      action,
      details: details ?? null,
    })
    .run();
}
