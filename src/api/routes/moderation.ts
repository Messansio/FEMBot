import type { Guild } from "discord.js";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, schema } from "../../db/index.js";
import { caseTypes, type ModCase } from "../../db/schema.js";
import { deleteCase, getCase, listCases, updateCase } from "../../services/cases.js";
import { buildCaseEmbed } from "../../services/modlog.js";
import { getGuildSettings } from "../../services/settings.js";
import { audit, ctx } from "../guard.js";
import type { ApiCase, ApiTicket, Paginated } from "../types.js";

const PAGE_SIZE = 25;

const tagOf = (guild: Guild, userId: string): string | null =>
  guild.client.users.cache.get(userId)?.tag ?? null;

function toApiCase(guild: Guild, c: ModCase): ApiCase {
  return {
    caseNumber: c.caseNumber,
    type: c.type,
    targetId: c.targetId,
    targetTag: c.targetTag,
    moderatorId: c.moderatorId,
    moderatorTag: tagOf(guild, c.moderatorId),
    reason: c.reason,
    durationMs: c.durationMs,
    expiresAt: c.expiresAt?.toISOString() ?? null,
    active: c.active,
    createdAt: c.createdAt.toISOString(),
  };
}

const caseQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  type: z.enum(caseTypes).optional(),
  user: z
    .string()
    .regex(/^\d{17,20}$/)
    .optional(),
});

const caseUpdateSchema = z
  .object({ reason: z.string().trim().max(512).nullable(), active: z.boolean() })
  .partial()
  .strict();

async function syncLogMessage(guild: Guild, modCase: ModCase): Promise<void> {
  const channelId = getGuildSettings(guild.id).modLogChannelId;
  const channel = channelId ? guild.channels.cache.get(channelId) : undefined;
  if (!modCase.logMessageId || !channel?.isTextBased()) return;
  await channel.messages.edit(modCase.logMessageId, { embeds: [buildCaseEmbed(modCase)] }).catch(() => undefined);
}

export async function moderationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/cases", async (request, reply) => {
    const { guild } = ctx(request);
    const query = caseQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: "Invalid query" });
    const { page, type, user } = query.data;

    const { cases, total } = listCases({
      guildId: guild.id,
      type,
      targetId: user,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    });
    const result: Paginated<ApiCase> = {
      items: cases.map((c) => toApiCase(guild, c)),
      total,
      page,
      pageSize: PAGE_SIZE,
    };
    return result;
  });

  app.patch<{ Params: { caseNumber: string } }>("/cases/:caseNumber", async (request, reply) => {
    const context = ctx(request);
    const existing = getCase(context.guild.id, Number(request.params.caseNumber));
    if (!existing) return reply.code(404).send({ error: "Case not found" });
    const body = caseUpdateSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Invalid body" });

    const { reason, active } = body.data;
    const updated = updateCase(existing.id, {
      ...(reason !== undefined ? { reason } : {}),
      ...(active !== undefined ? { active } : {}),
    });
    if (!updated) return reply.code(404).send({ error: "Case not found" });
    await syncLogMessage(context.guild, updated);
    audit(context, "case.update", { caseNumber: updated.caseNumber, ...body.data });
    return toApiCase(context.guild, updated);
  });

  app.delete<{ Params: { caseNumber: string } }>("/cases/:caseNumber", async (request, reply) => {
    const context = ctx(request);
    const existing = getCase(context.guild.id, Number(request.params.caseNumber));
    if (!existing) return reply.code(404).send({ error: "Case not found" });
    deleteCase(existing.id);
    audit(context, "case.delete", {
      caseNumber: existing.caseNumber,
      type: existing.type,
      targetId: existing.targetId,
    });
    return reply.code(204).send();
  });

  app.get<{ Querystring: { status?: string } }>("/tickets", async (request): Promise<ApiTicket[]> => {
    const { guild } = ctx(request);
    const status = request.query.status === "closed" ? "closed" : "open";
    return db
      .select()
      .from(schema.tickets)
      .where(and(eq(schema.tickets.guildId, guild.id), eq(schema.tickets.status, status)))
      .orderBy(desc(schema.tickets.createdAt))
      .limit(100)
      .all()
      .map((t) => ({
        id: t.id,
        channelId: t.channelId,
        openerId: t.openerId,
        openerTag: tagOf(guild, t.openerId),
        topic: t.topic,
        status: t.status,
        createdAt: t.createdAt.toISOString(),
        closedAt: t.closedAt?.toISOString() ?? null,
      }));
  });
}
