import type { Guild } from "discord.js";
import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, schema } from "../../db/index.js";
import type { GuildSettings } from "../../db/schema.js";
import { getGuildSettings, updateGuildSettings } from "../../services/settings.js";
import { audit, ctx } from "../guard.js";
import type { ApiAuditEntry, ApiSettings } from "../types.js";

const snowflake = z.string().regex(/^\d{17,20}$/, "Invalid ID");
const channelId = snowflake.nullable();
const roleList = z.array(snowflake).max(25);

export const settingsSchema = z
  .object({
    modLogChannelId: channelId,
    messageLogChannelId: channelId,
    memberLogChannelId: channelId,
    modRoleIds: roleList,
    dmOnPunish: z.boolean(),
    welcomeEnabled: z.boolean(),
    welcomeChannelId: channelId,
    welcomeMessage: z.string().trim().min(1).max(1500),
    leaveEnabled: z.boolean(),
    leaveChannelId: channelId,
    leaveMessage: z.string().trim().min(1).max(1500),
    autoroleIds: roleList.max(10),
    levelingEnabled: z.boolean(),
    xpMin: z.number().int().min(1).max(500),
    xpMax: z.number().int().min(1).max(500),
    xpCooldownSeconds: z.number().int().min(0).max(3600),
    levelUpChannelId: channelId,
    levelUpMessage: z.string().trim().min(1).max(1000),
    noXpChannelIds: z.array(snowflake).max(100),
    ticketChannelId: channelId,
    ticketStaffRoleIds: roleList,
    ticketLogChannelId: channelId,
    ticketMaxOpenPerUser: z.number().int().min(1).max(10),
  })
  .partial()
  .strict();

const channelKeys = [
  "modLogChannelId",
  "messageLogChannelId",
  "memberLogChannelId",
  "welcomeChannelId",
  "leaveChannelId",
  "levelUpChannelId",
  "ticketChannelId",
  "ticketLogChannelId",
] as const;
const roleKeys = ["modRoleIds", "autoroleIds", "ticketStaffRoleIds"] as const;

export function toApiSettings(settings: GuildSettings): ApiSettings {
  const { guildId: _guildId, updatedAt: _updatedAt, ticketChannelId, ...rest } = settings;
  return { ...rest, ticketChannelId };
}

/** Ensures every referenced channel/role belongs to this guild. Returns an error message or null. */
function validateReferences(guild: Guild, update: z.infer<typeof settingsSchema>): string | null {
  for (const key of channelKeys) {
    const id = update[key];
    if (id && !guild.channels.cache.has(id)) return `${key}: channel not found in this server`;
  }
  for (const id of update.noXpChannelIds ?? []) {
    if (!guild.channels.cache.has(id)) return "noXpChannelIds: channel not found in this server";
  }
  for (const key of roleKeys) {
    for (const id of update[key] ?? []) {
      if (!guild.roles.cache.has(id)) return `${key}: role not found in this server`;
    }
  }
  const me = guild.members.me;
  for (const id of update.autoroleIds ?? []) {
    const role = guild.roles.cache.get(id);
    if (!me || !role || role.managed || role.comparePositionTo(me.roles.highest) >= 0) {
      return `autoroleIds: the bot can't assign @${role?.name ?? id}`;
    }
  }
  return null;
}

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/settings", async (request) => toApiSettings(getGuildSettings(ctx(request).guild.id)));

  app.patch("/settings", async (request, reply) => {
    const context = ctx(request);
    const parsed = settingsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid settings", details: z.flattenError(parsed.error).fieldErrors });
    }
    const update = Object.fromEntries(
      Object.entries(parsed.data).filter(([, value]) => value !== undefined),
    ) as z.infer<typeof settingsSchema>;

    const referenceError = validateReferences(context.guild, update);
    if (referenceError) return reply.code(400).send({ error: referenceError });

    const before = getGuildSettings(context.guild.id);
    const changed = Object.fromEntries(
      Object.entries(update).filter(
        ([key, value]) => JSON.stringify(before[key as keyof GuildSettings]) !== JSON.stringify(value),
      ),
    );
    if (Object.keys(changed).length === 0) return toApiSettings(before);

    const after = updateGuildSettings(context.guild.id, changed);
    audit(context, "settings.update", {
      changes: Object.fromEntries(
        Object.keys(changed).map((key) => [
          key,
          { from: before[key as keyof GuildSettings], to: after[key as keyof GuildSettings] },
        ]),
      ),
    });
    return toApiSettings(after);
  });

  app.get<{ Querystring: { limit?: string } }>("/audit", async (request): Promise<ApiAuditEntry[]> => {
    const limit = Math.min(Math.max(Number(request.query.limit) || 50, 1), 200);
    return db
      .select()
      .from(schema.dashboardAudit)
      .where(eq(schema.dashboardAudit.guildId, ctx(request).guild.id))
      .orderBy(desc(schema.dashboardAudit.createdAt), desc(schema.dashboardAudit.id))
      .limit(limit)
      .all()
      .map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  });
}
