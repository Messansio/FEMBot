import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type GuildTextBasedChannel,
} from "discord.js";
import { replyError } from "../../services/moderation.js";
import { sendLog } from "../../services/modlog.js";
import { formatDuration, parseDuration } from "../../utils/duration.js";
import { defineGuildCommand, reasonOption } from "../helpers.js";

const lockableTypes = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum] as const;

export const slowmodeCommand = defineGuildCommand({
  data: new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set the slowmode of this (or another) channel.")
    .addStringOption((o) =>
      o.setName("duration").setDescription("e.g. 5s, 1m, 2h (max 6h), or 0 to disable").setRequired(true),
    )
    .addChannelOption((o) =>
      o.setName("channel").setDescription("Channel (default: current)").addChannelTypes(...lockableTypes),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const channel = interaction.options.getChannel("channel", false, lockableTypes) ?? interaction.channel;
    if (!channel || !("setRateLimitPerUser" in channel)) {
      await replyError(interaction, "Slowmode can't be set on this channel.");
      return;
    }
    const input = interaction.options.getString("duration", true);
    const ms = input.trim() === "0" ? 0 : parseDuration(input);
    if (ms === null || ms > 6 * 3_600_000) {
      await replyError(interaction, "Invalid duration (max 6h).");
      return;
    }
    await channel.setRateLimitPerUser(Math.floor(ms / 1000), `By ${interaction.user.tag}`);
    await interaction.reply(
      ms === 0 ? `⏱️ Slowmode disabled in ${channel}.` : `⏱️ Slowmode in ${channel} set to **${formatDuration(ms)}**.`,
    );
  },
});

async function setLocked(
  channel: GuildTextBasedChannel,
  locked: boolean,
  reason: string,
): Promise<void> {
  if (!("permissionOverwrites" in channel)) throw new Error("Channel can't be locked");
  await channel.permissionOverwrites.edit(
    channel.guild.roles.everyone,
    {
      SendMessages: locked ? false : null,
      SendMessagesInThreads: locked ? false : null,
      CreatePublicThreads: locked ? false : null,
      AddReactions: locked ? false : null,
    },
    { reason },
  );
}

function buildLockCommand(locked: boolean) {
  return defineGuildCommand({
    data: new SlashCommandBuilder()
      .setName(locked ? "lock" : "unlock")
      .setDescription(locked ? "Prevent @everyone from talking in a channel." : "Unlock a locked channel.")
      .addChannelOption((o) =>
        o.setName("channel").setDescription("Channel (default: current)").addChannelTypes(...lockableTypes),
      )
      .addStringOption(reasonOption)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async execute(interaction) {
      const channel = interaction.options.getChannel("channel", false, lockableTypes) ?? interaction.channel;
      if (!channel || channel.isThread() || channel.isVoiceBased()) {
        await replyError(interaction, "This channel can't be locked.");
        return;
      }
      const reason = interaction.options.getString("reason");
      try {
        await setLocked(channel as GuildTextBasedChannel, locked, `${interaction.user.tag}: ${reason ?? "No reason"}`);
      } catch {
        await replyError(interaction, "I couldn't edit that channel's permissions.");
        return;
      }
      const text = `${locked ? "🔒" : "🔓"} ${channel} has been **${locked ? "locked" : "unlocked"}**.` +
        (reason ? `\n> ${reason}` : "");
      await interaction.reply(text);
      await sendLog(interaction.guild, "modLogChannelId", {
        content: `${text}\n-# by <@${interaction.user.id}>`,
      });
    },
  });
}

export const lockCommand = buildLockCommand(true);
export const unlockCommand = buildLockCommand(false);
