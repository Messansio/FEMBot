import { PermissionFlagsBits, type Guild } from "discord.js";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, schema } from "../../db/index.js";
import { getLeaderboard, listLevelRewards } from "../../services/leveling.js";
import {
  MAX_PANEL_OPTIONS,
  createPanel,
  deletePanel,
  getPanel,
  listPanels,
  publishPanel,
  savePanel,
  type PanelWithOptions,
} from "../../services/rolePanels.js";
import { audit, ctx } from "../guard.js";
import type { ApiLeaderboardEntry, ApiLevelReward, ApiRolePanel } from "../types.js";

const snowflake = z.string().regex(/^\d{17,20}$/);

const panelSchema = z.object({
  title: z.string().trim().min(1).max(256),
  description: z.string().max(2000).default(""),
  mode: z.enum(["buttons", "select"]),
  maxChoices: z.number().int().min(0).max(25).default(0),
  options: z
    .array(
      z.object({
        roleId: snowflake,
        label: z.string().trim().min(1).max(80),
        emoji: z.string().trim().max(64).nullable().default(null),
        description: z.string().trim().max(100).nullable().default(null),
      }),
    )
    .max(MAX_PANEL_OPTIONS),
});

const rewardsSchema = z
  .array(z.object({ level: z.number().int().min(1).max(500), roleId: snowflake }))
  .max(100);

function toApiPanel(panel: PanelWithOptions): ApiRolePanel {
  return {
    id: panel.id,
    title: panel.title,
    description: panel.description,
    mode: panel.mode,
    maxChoices: panel.maxChoices,
    channelId: panel.channelId,
    messageId: panel.messageId,
    options: panel.options.map(({ roleId, label, emoji, description }) => ({ roleId, label, emoji, description })),
  };
}

/** Only roles the bot can manage and that don't grant dangerous permissions can be self-assigned. */
function invalidRole(guild: Guild, roleIds: string[]): string | null {
  const me = guild.members.me;
  for (const id of roleIds) {
    const role = guild.roles.cache.get(id);
    if (!role) return `Role ${id} not found`;
    if (!me || role.managed || role.comparePositionTo(me.roles.highest) >= 0) {
      return `The bot can't assign @${role.name}`;
    }
    if (role.permissions.any([PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.BanMembers])) {
      return `@${role.name} has moderator permissions and can't be self-assignable`;
    }
  }
  return null;
}

export async function communityRoutes(app: FastifyInstance): Promise<void> {
  // ── Role panels ────────────────────────────────────────────────
  app.get("/role-panels", async (request) => listPanels(ctx(request).guild.id).map(toApiPanel));

  app.post("/role-panels", async (request, reply) => {
    const context = ctx(request);
    const body = panelSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Invalid panel", details: z.flattenError(body.error).fieldErrors });
    const roleError = invalidRole(context.guild, body.data.options.map((o) => o.roleId));
    if (roleError) return reply.code(400).send({ error: roleError });

    const { options, ...fields } = body.data;
    const created = createPanel(context.guild.id, fields);
    const saved = savePanel(context.guild.id, created.id, body.data);
    audit(context, "rolePanel.create", { id: created.id, title: fields.title, roles: options.length });
    return reply.code(201).send(saved ? toApiPanel(saved) : null);
  });

  app.put<{ Params: { panelId: string } }>("/role-panels/:panelId", async (request, reply) => {
    const context = ctx(request);
    const body = panelSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Invalid panel", details: z.flattenError(body.error).fieldErrors });
    const roleError = invalidRole(context.guild, body.data.options.map((o) => o.roleId));
    if (roleError) return reply.code(400).send({ error: roleError });

    const saved = savePanel(context.guild.id, Number(request.params.panelId), body.data);
    if (!saved) return reply.code(404).send({ error: "Panel not found" });
    audit(context, "rolePanel.update", { id: saved.id, title: saved.title });
    // Keep the posted message in sync.
    if (saved.channelId && saved.messageId && saved.options.length > 0) {
      await publishPanel(context.guild, saved.id).catch(() => undefined);
    }
    return toApiPanel(saved);
  });

  app.post<{ Params: { panelId: string } }>("/role-panels/:panelId/publish", async (request, reply) => {
    const context = ctx(request);
    const body = z.object({ channelId: snowflake }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "channelId is required" });
    const panelId = Number(request.params.panelId);
    if (!getPanel(context.guild.id, panelId)) return reply.code(404).send({ error: "Panel not found" });
    try {
      await publishPanel(context.guild, panelId, body.data.channelId);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Publish failed" });
    }
    audit(context, "rolePanel.publish", { id: panelId, channelId: body.data.channelId });
    const panel = getPanel(context.guild.id, panelId);
    return panel ? toApiPanel(panel) : null;
  });

  app.delete<{ Params: { panelId: string } }>("/role-panels/:panelId", async (request, reply) => {
    const context = ctx(request);
    const deleted = deletePanel(context.guild.id, Number(request.params.panelId));
    if (!deleted) return reply.code(404).send({ error: "Panel not found" });
    if (deleted.channelId && deleted.messageId) {
      const channel = context.guild.channels.cache.get(deleted.channelId);
      if (channel?.isTextBased()) await channel.messages.delete(deleted.messageId).catch(() => undefined);
    }
    audit(context, "rolePanel.delete", { id: deleted.id, title: deleted.title });
    return reply.code(204).send();
  });

  // ── Leveling ───────────────────────────────────────────────────
  app.get("/level-rewards", async (request): Promise<ApiLevelReward[]> =>
    listLevelRewards(ctx(request).guild.id).map(({ level, roleId }) => ({ level, roleId })),
  );

  app.put("/level-rewards", async (request, reply) => {
    const context = ctx(request);
    const body = rewardsSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Invalid rewards" });
    const roleError = invalidRole(context.guild, [...new Set(body.data.map((r) => r.roleId))]);
    if (roleError) return reply.code(400).send({ error: roleError });

    const guildId = context.guild.id;
    db.transaction((tx) => {
      tx.delete(schema.levelRewards).where(eq(schema.levelRewards.guildId, guildId)).run();
      if (body.data.length > 0) {
        tx.insert(schema.levelRewards)
          .values(body.data.map((r) => ({ guildId, ...r })))
          .onConflictDoNothing()
          .run();
      }
    });
    audit(context, "levelRewards.update", { count: body.data.length });
    return listLevelRewards(guildId).map(({ level, roleId }) => ({ level, roleId }));
  });

  app.get<{ Querystring: { page?: string } }>("/leaderboard", async (request): Promise<ApiLeaderboardEntry[]> => {
    const { guild } = ctx(request);
    const page = Math.max(Number(request.query.page) || 1, 1);
    return getLeaderboard(guild.id, 50, (page - 1) * 50).map((row) => {
      const user = guild.client.users.cache.get(row.userId);
      return {
        userId: row.userId,
        username: user?.username ?? null,
        avatarUrl: user?.displayAvatarURL({ size: 64 }) ?? null,
        xp: row.xp,
        level: row.level,
        messageCount: row.messageCount,
      };
    });
  });
}
