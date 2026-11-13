import { and, asc, count, desc, eq, gt, lte } from "drizzle-orm";
import { PermissionFlagsBits, type Message } from "discord.js";
import { db, schema } from "../db/index.js";
import { getGuildSettings, renderTemplate } from "./settings.js";

/** XP needed to go from `level` to `level + 1`. */
export const xpForNextLevel = (level: number): number => 5 * level ** 2 + 50 * level + 100;

/** Converts total XP into the level and progress inside that level. */
export function levelFromXp(totalXp: number): { level: number; current: number; needed: number } {
  let level = 0;
  let remaining = totalXp;
  while (remaining >= xpForNextLevel(level)) {
    remaining -= xpForNextLevel(level);
    level++;
  }
  return { level, current: remaining, needed: xpForNextLevel(level) };
}

export function getMemberLevel(guildId: string, userId: string) {
  const row = db
    .select()
    .from(schema.memberLevels)
    .where(and(eq(schema.memberLevels.guildId, guildId), eq(schema.memberLevels.userId, userId)))
    .get();
  const xp = row?.xp ?? 0;
  const rank =
    (db
      .select({ value: count() })
      .from(schema.memberLevels)
      .where(and(eq(schema.memberLevels.guildId, guildId), gt(schema.memberLevels.xp, xp)))
      .get()?.value ?? 0) + 1;
  return { xp, messageCount: row?.messageCount ?? 0, rank, ...levelFromXp(xp) };
}

export function getLeaderboard(guildId: string, limit = 10, offset = 0) {
  return db
    .select()
    .from(schema.memberLevels)
    .where(eq(schema.memberLevels.guildId, guildId))
    .orderBy(desc(schema.memberLevels.xp))
    .limit(limit)
    .offset(offset)
    .all();
}

export function listLevelRewards(guildId: string) {
  return db
    .select()
    .from(schema.levelRewards)
    .where(eq(schema.levelRewards.guildId, guildId))
    .orderBy(asc(schema.levelRewards.level))
    .all();
}

export function setLevelXp(guildId: string, userId: string, xp: number): void {
  const level = levelFromXp(xp).level;
  db.insert(schema.memberLevels)
    .values({ guildId, userId, xp, level })
    .onConflictDoUpdate({
      target: [schema.memberLevels.guildId, schema.memberLevels.userId],
      set: { xp, level },
    })
    .run();
}

/** Awards XP for a message, respecting the per-guild cooldown. Announces level-ups and gives reward roles. */
export async function handleMessageXp(message: Message<true>): Promise<void> {
  const settings = getGuildSettings(message.guildId);
  if (!settings.levelingEnabled) return;
  if (settings.noXpChannelIds.includes(message.channelId)) return;

  const now = Date.now();
  const existing = db
    .select()
    .from(schema.memberLevels)
    .where(
      and(eq(schema.memberLevels.guildId, message.guildId), eq(schema.memberLevels.userId, message.author.id)),
    )
    .get();

  if (existing?.lastXpAt && now - existing.lastXpAt.getTime() < settings.xpCooldownSeconds * 1000) {
    db.update(schema.memberLevels)
      .set({ messageCount: existing.messageCount + 1 })
      .where(
        and(eq(schema.memberLevels.guildId, message.guildId), eq(schema.memberLevels.userId, message.author.id)),
      )
      .run();
    return;
  }

  const min = Math.min(settings.xpMin, settings.xpMax);
  const max = Math.max(settings.xpMin, settings.xpMax);
  const gained = Math.floor(Math.random() * (max - min + 1)) + min;
  const xp = (existing?.xp ?? 0) + gained;
  const previousLevel = existing?.level ?? 0;
  const { level } = levelFromXp(xp);

  db.insert(schema.memberLevels)
    .values({
      guildId: message.guildId,
      userId: message.author.id,
      xp,
      level,
      messageCount: 1,
      lastXpAt: new Date(now),
    })
    .onConflictDoUpdate({
      target: [schema.memberLevels.guildId, schema.memberLevels.userId],
      set: { xp, level, messageCount: (existing?.messageCount ?? 0) + 1, lastXpAt: new Date(now) },
    })
    .run();

  if (level <= previousLevel) return;

  // Reward roles for every level reached (catches up if levels were skipped).
  const rewards = db
    .select()
    .from(schema.levelRewards)
    .where(and(eq(schema.levelRewards.guildId, message.guildId), lte(schema.levelRewards.level, level)))
    .all();
  const member = message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
  const me = message.guild.members.me;
  if (member && me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    const toAdd = rewards
      .map((reward) => reward.roleId)
      .filter((roleId) => {
        const role = message.guild.roles.cache.get(roleId);
        return role && !member.roles.cache.has(roleId) && role.comparePositionTo(me.roles.highest) < 0;
      });
    if (toAdd.length > 0) {
      await member.roles.add(toAdd, `Level ${level} reward`).catch((error: unknown) => {
        console.warn("Failed to give level rewards:", error);
      });
    }
  }

  const content = renderTemplate(settings.levelUpMessage, {
    user: `<@${message.author.id}>`,
    username: message.author.username,
    level,
    server: message.guild.name,
  });
  const target = settings.levelUpChannelId
    ? message.guild.channels.cache.get(settings.levelUpChannelId)
    : message.channel;
  if (target?.isTextBased()) {
    await target.send({ content, allowedMentions: { users: [message.author.id] } }).catch(() => undefined);
  }
}
