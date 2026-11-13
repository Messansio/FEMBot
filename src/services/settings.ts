import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import type { GuildSettings } from "../db/schema.js";

export type SettingsUpdate = Partial<Omit<GuildSettings, "guildId" | "updatedAt">>;

const cache = new Map<string, GuildSettings>();

/** Returns the settings row for a guild, creating it with defaults on first access. */
export function getGuildSettings(guildId: string): GuildSettings {
  const cached = cache.get(guildId);
  if (cached) return cached;

  let row = db
    .select()
    .from(schema.guildSettings)
    .where(eq(schema.guildSettings.guildId, guildId))
    .get();

  if (!row) {
    row = db
      .insert(schema.guildSettings)
      .values({ guildId })
      .onConflictDoNothing()
      .returning()
      .get();
    row ??= db
      .select()
      .from(schema.guildSettings)
      .where(eq(schema.guildSettings.guildId, guildId))
      .get();
  }

  if (!row) throw new Error(`Could not load settings for guild ${guildId}`);
  cache.set(guildId, row);
  return row;
}

export function updateGuildSettings(guildId: string, update: SettingsUpdate): GuildSettings {
  getGuildSettings(guildId); // make sure the row exists
  const row = db
    .update(schema.guildSettings)
    .set({ ...update, updatedAt: new Date() })
    .where(eq(schema.guildSettings.guildId, guildId))
    .returning()
    .get();

  if (!row) throw new Error(`Could not update settings for guild ${guildId}`);
  cache.set(guildId, row);
  return row;
}

export function invalidateGuildSettings(guildId: string): void {
  cache.delete(guildId);
}

/** Replaces `{placeholders}` in user-configured templates. */
export function renderTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
