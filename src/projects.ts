import { ChannelType, PermissionFlagsBits } from "discord.js";
import type { CategoryChannel, Client, Guild } from "discord.js";
import { all, one, run } from "./db.js";
import type { ProjectRow } from "./db.js";
import { UserError } from "./errors.js";

const TEXT_CHANNELS = ["general", "commits", "pull-requests"];
const VOICE_CHANNELS = ["Lounge", "Pair programming"];

const P = PermissionFlagsBits;
const MEMBER_ALLOW = [
  P.ViewChannel, P.ReadMessageHistory, P.SendMessages, P.SendMessagesInThreads, P.AddReactions,
  P.AttachFiles, P.EmbedLinks, P.Connect, P.Speak, P.Stream, P.UseVAD,
];
const TALK = [
  P.SendMessages, P.SendMessagesInThreads, P.CreatePublicThreads, P.CreatePrivateThreads,
  P.AddReactions, P.AttachFiles, P.Speak, P.Stream,
];

export type Access = "member" | "muted" | "banned" | "none";

const ACCESS: Record<Exclude<Access, "none">, { allow: bigint[]; deny: bigint[] }> = {
  member: { allow: MEMBER_ALLOW, deny: [] },
  muted: { allow: [P.ViewChannel, P.ReadMessageHistory, P.Connect], deny: TALK },
  banned: { allow: [], deny: [P.ViewChannel, P.Connect] },
};

/** Creates the private category (named after the repo) with its text and voice channels. */
export async function createProjectChannels(guild: Guild, repoName: string, ownerId: string): Promise<CategoryChannel> {
  const botId = guild.client.user.id;
  const category = await guild.channels.create({
    name: repoName.slice(0, 100),
    type: ChannelType.GuildCategory,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [P.ViewChannel, P.Connect] },
      { id: botId, allow: [P.ViewChannel, P.ManageChannels, P.SendMessages, P.Connect, P.MoveMembers] },
      { id: ownerId, allow: MEMBER_ALLOW },
    ],
  });
  for (const name of TEXT_CHANNELS) {
    await guild.channels.create({ name, type: ChannelType.GuildText, parent: category.id });
  }
  for (const name of VOICE_CHANNELS) {
    await guild.channels.create({ name, type: ChannelType.GuildVoice, parent: category.id });
  }
  return category;
}

async function fetchCategory(guild: Guild, project: ProjectRow): Promise<CategoryChannel> {
  const channel = await guild.channels.fetch(project.category_id).catch(() => null);
  if (channel?.type !== ChannelType.GuildCategory) {
    throw new UserError("The project's channels no longer exist.");
  }
  return channel;
}

export function firstTextChannelId(guild: Guild, project: ProjectRow): string {
  const child = guild.channels.cache.find(
    (c) => c.parentId === project.category_id && c.type === ChannelType.GuildText,
  );
  return child?.id ?? project.category_id;
}

/** Sets one user's access on the category and syncs every channel in it. */
export async function setAccess(guild: Guild, project: ProjectRow, userId: string, access: Access): Promise<void> {
  const category = await fetchCategory(guild, project);
  if (access === "none") {
    await category.permissionOverwrites.delete(userId);
  } else {
    const options: Record<string, boolean> = {};
    const names = Object.entries(P) as [string, bigint][];
    for (const [name, bit] of names) {
      if (ACCESS[access].allow.includes(bit)) options[name] = true;
      if (ACCESS[access].deny.includes(bit)) options[name] = false;
    }
    await category.permissionOverwrites.create(userId, options as Partial<Record<keyof typeof P, boolean>>);
  }
  await Promise.all(
    guild.channels.cache.filter((c) => c.parentId === category.id && "lockPermissions" in c).map((c) =>
      "lockPermissions" in c ? c.lockPermissions() : undefined,
    ),
  );

  if (access === "banned" || access === "muted") {
    // Permission changes apply to voice on rejoin; disconnect so they take effect now.
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member?.voice.channel?.parentId === category.id) await member.voice.disconnect();
  }
}

/** Whether the user currently has access to the project (owner or invited, not banned). */
export async function hasAccess(guild: Guild, project: ProjectRow, userId: string): Promise<boolean> {
  const category = await fetchCategory(guild, project);
  return category.permissionOverwrites.cache.get(userId)?.allow.has(P.ViewChannel) ?? false;
}

export async function deleteProjectChannels(guild: Guild, project: ProjectRow): Promise<void> {
  const category = await guild.channels.fetch(project.category_id).catch(() => null);
  if (category) {
    const children = guild.channels.cache.filter((c) => c.parentId === category.id);
    for (const child of children.values()) await child.delete("Project deleted");
    await category.delete("Project deleted");
  }
  run("DELETE FROM projects WHERE id = ?", project.id);
}

// --- Lookups -------------------------------------------------------------------------

export function getProject(id: number): ProjectRow | undefined {
  return one<ProjectRow>("SELECT * FROM projects WHERE id = ?", id);
}

/** The project a channel belongs to (the category itself or any channel in it). */
export function projectForChannel(channel: { id: string; parentId?: string | null } | null): ProjectRow | undefined {
  if (!channel) return undefined;
  return one<ProjectRow>(
    "SELECT * FROM projects WHERE category_id = ? OR category_id = ?",
    channel.id,
    channel.parentId ?? channel.id,
  );
}

export function projectsOwnedBy(discordUserId: string): ProjectRow[] {
  return all<ProjectRow>("SELECT * FROM projects WHERE owner_discord_id = ? ORDER BY created_at DESC", discordUserId);
}

export function isBanned(projectId: number, userId: string): boolean {
  return Boolean(one("SELECT 1 FROM project_bans WHERE project_id = ? AND discord_user_id = ?", projectId, userId));
}

export function activeMuteUntil(projectId: number, userId: string): number | undefined {
  const row = one<{ until: number }>(
    "SELECT until FROM project_mutes WHERE project_id = ? AND discord_user_id = ? AND until > ?",
    projectId,
    userId,
    Date.now(),
  );
  return row?.until;
}

// --- Timed mutes ---------------------------------------------------------------------

const MAX_TIMEOUT = 2 ** 31 - 1; // setTimeout limit (~24.8 days)
const timers = new Map<string, NodeJS.Timeout>();

export function scheduleUnmute(client: Client, projectId: number, userId: string, until: number): void {
  const key = `${projectId}:${userId}`;
  clearTimeout(timers.get(key));
  const delay = until - Date.now();
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      if (delay > MAX_TIMEOUT) scheduleUnmute(client, projectId, userId, until);
      else void unmute(client, projectId, userId).catch((e: unknown) => console.error("Unmute failed:", e));
    }, Math.max(0, Math.min(delay, MAX_TIMEOUT))),
  );
}

export async function unmute(client: Client, projectId: number, userId: string): Promise<void> {
  clearTimeout(timers.get(`${projectId}:${userId}`));
  run("DELETE FROM project_mutes WHERE project_id = ? AND discord_user_id = ?", projectId, userId);
  const project = getProject(projectId);
  const guild = project && (await client.guilds.fetch(project.guild_id).catch(() => null));
  if (project && guild && !isBanned(projectId, userId)) await setAccess(guild, project, userId, "member");
}

/** On startup: resume every pending mute (and lift the ones that ended while offline). */
export function restoreMutes(client: Client): void {
  for (const mute of all<{ project_id: number; discord_user_id: string; until: number }>("SELECT * FROM project_mutes")) {
    scheduleUnmute(client, mute.project_id, mute.discord_user_id, mute.until);
  }
}

/** "30m", "2h", "1d", "1w" → milliseconds (max 28 days). */
export function parseDuration(input: string): number {
  const match = input.trim().toLowerCase().match(/^(\d+)\s*(m|min|h|d|w)$/);
  if (!match) throw new UserError("Duration looks like `30m`, `2h`, `1d` or `1w`.");
  const unit = { m: 60_000, min: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }[match[2] as "m"];
  const ms = Number(match[1]) * unit;
  if (ms < 60_000 || ms > 28 * 86_400_000) throw new UserError("Duration must be between 1 minute and 28 days.");
  return ms;
}
