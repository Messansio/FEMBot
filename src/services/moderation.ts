import {
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type GuildMember,
  type User,
} from "discord.js";
import type { CaseType, ModCase } from "../db/schema.js";
import { formatDuration } from "../utils/duration.js";
import { createCase } from "./cases.js";
import { caseColors, logCase } from "./modlog.js";
import { canModerate } from "./permissions.js";
import { getGuildSettings } from "./settings.js";

const pastTense: Record<CaseType, string> = {
  ban: "banned",
  unban: "unbanned",
  kick: "kicked",
  timeout: "timed out",
  untimeout: "removed from timeout",
  warn: "warned",
  note: "noted",
};

export async function replyError(
  interaction: ChatInputCommandInteraction,
  content: string,
): Promise<void> {
  const payload = { content: `❌ ${content}`, flags: MessageFlags.Ephemeral as const };
  if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
  else await interaction.reply(payload);
}

/** Sends the punished user a DM. Returns true when delivered. */
async function notifyTarget(
  user: User,
  guildName: string,
  type: CaseType,
  reason: string | null,
  durationMs: number | null,
): Promise<boolean> {
  if (user.bot || type === "note") return false;
  const embed = new EmbedBuilder()
    .setColor(caseColors[type])
    .setTitle(`You were ${pastTense[type]} in ${guildName}`)
    .addFields({ name: "Reason", value: reason ?? "_No reason provided_" });
  if (durationMs) embed.addFields({ name: "Duration", value: formatDuration(durationMs) });

  try {
    await user.send({ embeds: [embed] });
    return true;
  } catch {
    return false; // DMs closed
  }
}

export interface ModerationAction {
  interaction: ChatInputCommandInteraction<"cached">;
  type: CaseType;
  user: User;
  /** Required when the action targets a current member (hierarchy checks). */
  member?: GuildMember | null;
  reason: string | null;
  durationMs?: number | null;
  /** Performs the Discord action. Runs after the DM so kicked/banned users can still be reached. */
  perform?: () => Promise<unknown>;
  /** Extra work with the created case (e.g. scheduling an unban). */
  afterCase?: (modCase: ModCase) => void;
  silent?: boolean;
}

/**
 * Shared flow for every moderation command:
 * hierarchy check → DM → action → case → modlog → reply.
 */
export async function runModerationAction(action: ModerationAction): Promise<ModCase | null> {
  const { interaction, type, user, member, reason } = action;
  const durationMs = action.durationMs ?? null;
  const guild = interaction.guild;
  const botMember = guild.members.me ?? (await guild.members.fetchMe());

  if (member) {
    const check = canModerate(interaction.member, member, botMember);
    if (!check.ok) {
      await replyError(interaction, check.reason);
      return null;
    }
  }

  const settings = getGuildSettings(guild.id);
  const dmSent =
    settings.dmOnPunish && !action.silent && type !== "unban"
      ? await notifyTarget(user, guild.name, type, reason, durationMs)
      : false;

  try {
    await action.perform?.();
  } catch (error) {
    console.error(`Moderation action ${type} failed:`, error);
    await replyError(
      interaction,
      `I couldn't ${type} ${user.tag}. Check my permissions and role position.`,
    );
    return null;
  }

  const modCase = createCase({
    guildId: guild.id,
    type,
    targetId: user.id,
    targetTag: user.tag,
    moderatorId: interaction.user.id,
    reason,
    durationMs,
  });
  action.afterCase?.(modCase);
  await logCase(guild, modCase);

  const content =
    `✅ **${user.tag}** was ${pastTense[type]}` +
    (durationMs ? ` for ${formatDuration(durationMs)}` : "") +
    ` | Case #${modCase.caseNumber}` +
    (reason ? `\n> ${reason}` : "") +
    (type !== "note" && type !== "unban" && !dmSent ? "\n-# User could not be DMed." : "");

  if (interaction.deferred || interaction.replied) await interaction.editReply({ content });
  else await interaction.reply({ content, allowedMentions: { parse: [] } });
  return modCase;
}
