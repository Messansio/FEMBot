import type { Client } from "discord.js";
import { and, eq, lte } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { createCase, deactivateCases } from "./cases.js";
import { logCase } from "./modlog.js";

const INTERVAL_MS = 30_000;

export function scheduleUnban(guildId: string, targetId: string, runAt: Date, caseId: number): void {
  db.insert(schema.scheduledActions)
    .values({ guildId, type: "unban", targetId, runAt, caseId })
    .run();
}

export function cancelScheduledUnban(guildId: string, targetId: string): void {
  db.delete(schema.scheduledActions)
    .where(
      and(
        eq(schema.scheduledActions.guildId, guildId),
        eq(schema.scheduledActions.targetId, targetId),
        eq(schema.scheduledActions.type, "unban"),
      ),
    )
    .run();
}

async function processDueActions(client: Client<true>): Promise<void> {
  const due = db
    .select()
    .from(schema.scheduledActions)
    .where(lte(schema.scheduledActions.runAt, new Date()))
    .limit(50)
    .all();

  for (const action of due) {
    // Remove first so a failing action doesn't retry forever.
    db.delete(schema.scheduledActions).where(eq(schema.scheduledActions.id, action.id)).run();

    const guild = client.guilds.cache.get(action.guildId);
    if (!guild) continue;

    try {
      if (action.type === "unban") {
        const ban = await guild.bans.fetch(action.targetId).catch(() => null);
        if (!ban) continue;
        await guild.bans.remove(action.targetId, "Temporary ban expired");
        deactivateCases(guild.id, action.targetId, "ban");
        const modCase = createCase({
          guildId: guild.id,
          type: "unban",
          targetId: action.targetId,
          targetTag: ban.user.tag,
          moderatorId: client.user.id,
          reason: "Temporary ban expired",
        });
        await logCase(guild, modCase);
      }
    } catch (error) {
      console.error(`Scheduled ${action.type} failed for ${action.targetId}:`, error);
    }
  }
}

export function startScheduler(client: Client<true>): NodeJS.Timeout {
  let running = false;
  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      await processDueActions(client);
    } finally {
      running = false;
    }
  };
  void tick();
  return setInterval(() => void tick(), INTERVAL_MS);
}
