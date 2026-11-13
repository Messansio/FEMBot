import {
  EmbedBuilder,
  PermissionFlagsBits,
  type Guild,
  type MessageCreateOptions,
} from "discord.js";
import type { CaseType, GuildSettings, ModCase } from "../db/schema.js";
import { discordTimestamp, formatDuration } from "../utils/duration.js";
import { updateCase } from "./cases.js";
import { getGuildSettings } from "./settings.js";

export const caseColors: Record<CaseType, number> = {
  ban: 0xed4245,
  unban: 0x57f287,
  kick: 0xe67e22,
  timeout: 0xfee75c,
  untimeout: 0x57f287,
  warn: 0xf1c40f,
  note: 0x5865f2,
};

type LogChannelKey = keyof Pick<
  GuildSettings,
  "modLogChannelId" | "messageLogChannelId" | "memberLogChannelId" | "ticketLogChannelId"
>;

/** Sends a message to one of the configured log channels. Fails silently if it is missing or unusable. */
export async function sendLog(
  guild: Guild,
  channelKey: LogChannelKey,
  payload: MessageCreateOptions,
): Promise<string | null> {
  const channelId = getGuildSettings(guild.id)[channelKey];
  if (!channelId) return null;

  const channel = guild.channels.cache.get(channelId);
  const me = guild.members.me;
  if (!channel?.isTextBased() || !me) return null;
  if (
    !channel
      .permissionsFor(me)
      .has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])
  ) {
    return null;
  }

  try {
    const message = await channel.send({ allowedMentions: { parse: [] }, ...payload });
    return message.id;
  } catch (error) {
    console.warn(`Failed to send ${channelKey} log in guild ${guild.id}:`, error);
    return null;
  }
}

export function buildCaseEmbed(modCase: ModCase): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(caseColors[modCase.type])
    .setTitle(`Case #${modCase.caseNumber} | ${modCase.type.toUpperCase()}`)
    .addFields(
      { name: "User", value: `${modCase.targetTag} (<@${modCase.targetId}>)`, inline: true },
      { name: "Moderator", value: `<@${modCase.moderatorId}>`, inline: true },
      { name: "Reason", value: modCase.reason ?? "_No reason provided_" },
    )
    .setFooter({ text: `User ID: ${modCase.targetId}` })
    .setTimestamp(modCase.createdAt);

  if (modCase.durationMs) {
    embed.addFields({
      name: "Duration",
      value: `${formatDuration(modCase.durationMs)}${
        modCase.expiresAt ? ` (expires ${discordTimestamp(modCase.expiresAt, "R")})` : ""
      }`,
      inline: true,
    });
  }
  if (!modCase.active && modCase.type !== "note") {
    embed.addFields({ name: "Status", value: "Inactive / revoked", inline: true });
  }
  return embed;
}

export async function logCase(guild: Guild, modCase: ModCase): Promise<void> {
  const messageId = await sendLog(guild, "modLogChannelId", { embeds: [buildCaseEmbed(modCase)] });
  if (messageId) updateCase(modCase.id, { logMessageId: messageId });
}
