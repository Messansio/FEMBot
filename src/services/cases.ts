import { and, count, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import type { CaseType, ModCase } from "../db/schema.js";

export interface NewCase {
  guildId: string;
  type: CaseType;
  targetId: string;
  targetTag: string;
  moderatorId: string;
  reason: string | null;
  durationMs?: number | null;
}

/** Creates a case with the next per-guild case number (atomic). */
export function createCase(input: NewCase): ModCase {
  return db.transaction((tx) => {
    const last = tx
      .select({ max: sql<number | null>`max(${schema.modCases.caseNumber})` })
      .from(schema.modCases)
      .where(eq(schema.modCases.guildId, input.guildId))
      .get();

    const durationMs = input.durationMs ?? null;
    return tx
      .insert(schema.modCases)
      .values({
        ...input,
        durationMs,
        expiresAt: durationMs ? new Date(Date.now() + durationMs) : null,
        caseNumber: (last?.max ?? 0) + 1,
      })
      .returning()
      .get();
  });
}

export function getCase(guildId: string, caseNumber: number): ModCase | undefined {
  return db
    .select()
    .from(schema.modCases)
    .where(and(eq(schema.modCases.guildId, guildId), eq(schema.modCases.caseNumber, caseNumber)))
    .get();
}

export function updateCase(
  id: number,
  update: Partial<Pick<ModCase, "reason" | "active" | "logMessageId">>,
): ModCase | undefined {
  return db.update(schema.modCases).set(update).where(eq(schema.modCases.id, id)).returning().get();
}

export function deleteCase(id: number): void {
  db.delete(schema.modCases).where(eq(schema.modCases.id, id)).run();
}

export interface CaseQuery {
  guildId: string;
  targetId?: string | undefined;
  type?: CaseType | undefined;
  limit?: number;
  offset?: number;
}

export function listCases(query: CaseQuery): { cases: ModCase[]; total: number } {
  const where = and(
    eq(schema.modCases.guildId, query.guildId),
    query.targetId ? eq(schema.modCases.targetId, query.targetId) : undefined,
    query.type ? eq(schema.modCases.type, query.type) : undefined,
  );

  const cases = db
    .select()
    .from(schema.modCases)
    .where(where)
    .orderBy(desc(schema.modCases.caseNumber))
    .limit(query.limit ?? 25)
    .offset(query.offset ?? 0)
    .all();
  const total = db.select({ value: count() }).from(schema.modCases).where(where).get()?.value ?? 0;
  return { cases, total };
}

/** Marks the user's active cases of a type as inactive (e.g. ban → unban). */
export function deactivateCases(guildId: string, targetId: string, type: CaseType): void {
  db.update(schema.modCases)
    .set({ active: false })
    .where(
      and(
        eq(schema.modCases.guildId, guildId),
        eq(schema.modCases.targetId, targetId),
        eq(schema.modCases.type, type),
        eq(schema.modCases.active, true),
      ),
    )
    .run();
}
