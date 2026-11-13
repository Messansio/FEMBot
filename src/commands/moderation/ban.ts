import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { cancelScheduledUnban, scheduleUnban } from "../../services/scheduler.js";
import { runModerationAction, replyError } from "../../services/moderation.js";
import { parseDuration } from "../../utils/duration.js";
import { defineGuildCommand, reasonOption } from "../helpers.js";

export const banCommand = defineGuildCommand({
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user (works even if they are not in the server).")
    .addUserOption((o) => o.setName("user").setDescription("User to ban").setRequired(true))
    .addStringOption(reasonOption)
    .addStringOption((o) =>
      o.setName("duration").setDescription("Temporary ban, e.g. 1h, 7d, 2w (empty = permanent)"),
    )
    .addIntegerOption((o) =>
      o
        .setName("delete_messages")
        .setDescription("Delete the user's recent messages")
        .addChoices(
          { name: "Don't delete", value: 0 },
          { name: "Last hour", value: 3600 },
          { name: "Last 24 hours", value: 86_400 },
          { name: "Last 7 days", value: 604_800 },
        ),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    const user = interaction.options.getUser("user", true);
    const member = interaction.options.getMember("user");
    const reason = interaction.options.getString("reason");
    const durationInput = interaction.options.getString("duration");
    const deleteMessageSeconds = interaction.options.getInteger("delete_messages") ?? 0;

    const durationMs = durationInput ? parseDuration(durationInput) : null;
    if (durationInput && !durationMs) {
      await replyError(interaction, "Invalid duration. Use formats like `30m`, `12h`, `7d`, `2w`.");
      return;
    }

    await runModerationAction({
      interaction,
      type: "ban",
      user,
      member,
      reason,
      durationMs,
      perform: () =>
        interaction.guild.bans.create(user.id, {
          reason: `${interaction.user.tag}: ${reason ?? "No reason"}`,
          deleteMessageSeconds,
        }),
      afterCase: (modCase) => {
        cancelScheduledUnban(interaction.guildId, user.id);
        if (modCase.expiresAt) {
          scheduleUnban(interaction.guildId, user.id, modCase.expiresAt, modCase.id);
        }
      },
    });
  },
});
