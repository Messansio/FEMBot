import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { deactivateCases } from "../../services/cases.js";
import { replyError, runModerationAction } from "../../services/moderation.js";
import { parseDuration } from "../../utils/duration.js";
import { defineGuildCommand, reasonOption } from "../helpers.js";

const MAX_TIMEOUT_MS = 28 * 86_400_000; // Discord limit: 28 days

export const timeoutCommand = defineGuildCommand({
  data: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Time out a member (they can't chat or join voice).")
    .addUserOption((o) => o.setName("user").setDescription("Member to time out").setRequired(true))
    .addStringOption((o) =>
      o.setName("duration").setDescription("e.g. 10m, 1h, 1d (max 28d)").setRequired(true),
    )
    .addStringOption(reasonOption)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const member = interaction.options.getMember("user");
    if (!member) {
      await replyError(interaction, "That user is not in this server.");
      return;
    }
    const durationMs = parseDuration(interaction.options.getString("duration", true));
    if (!durationMs || durationMs > MAX_TIMEOUT_MS) {
      await replyError(interaction, "Invalid duration. Use e.g. `10m`, `2h`, `7d` (max 28 days).");
      return;
    }
    const reason = interaction.options.getString("reason");

    await runModerationAction({
      interaction,
      type: "timeout",
      user: member.user,
      member,
      reason,
      durationMs,
      perform: () => member.timeout(durationMs, `${interaction.user.tag}: ${reason ?? "No reason"}`),
    });
  },
});

export const untimeoutCommand = defineGuildCommand({
  data: new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Remove a member's timeout.")
    .addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true))
    .addStringOption(reasonOption)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const member = interaction.options.getMember("user");
    if (!member?.isCommunicationDisabled()) {
      await replyError(interaction, "That member is not timed out.");
      return;
    }
    const reason = interaction.options.getString("reason");

    await runModerationAction({
      interaction,
      type: "untimeout",
      user: member.user,
      member,
      reason,
      perform: () => member.timeout(null, `${interaction.user.tag}: ${reason ?? "No reason"}`),
      afterCase: () => deactivateCases(interaction.guildId, member.id, "timeout"),
    });
  },
});
