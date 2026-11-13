import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { replyError, runModerationAction } from "../../services/moderation.js";
import { defineGuildCommand } from "../helpers.js";

export const warnCommand = defineGuildCommand({
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a member. Warnings are stored as cases.")
    .addUserOption((o) => o.setName("user").setDescription("Member to warn").setRequired(true))
    .addStringOption((o) =>
      o.setName("reason").setDescription("Reason for the warning").setRequired(true).setMaxLength(512),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const member = interaction.options.getMember("user");
    if (!member) {
      await replyError(interaction, "That user is not in this server.");
      return;
    }
    await runModerationAction({
      interaction,
      type: "warn",
      user: member.user,
      member,
      reason: interaction.options.getString("reason", true),
    });
  },
});

export const noteCommand = defineGuildCommand({
  data: new SlashCommandBuilder()
    .setName("note")
    .setDescription("Add a private staff note to a user's history (they are not notified).")
    .addUserOption((o) => o.setName("user").setDescription("User").setRequired(true))
    .addStringOption((o) =>
      o.setName("note").setDescription("The note").setRequired(true).setMaxLength(512),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    await runModerationAction({
      interaction,
      type: "note",
      user: interaction.options.getUser("user", true),
      reason: interaction.options.getString("note", true),
      silent: true,
    });
  },
});
