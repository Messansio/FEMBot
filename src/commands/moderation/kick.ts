import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { replyError, runModerationAction } from "../../services/moderation.js";
import { defineGuildCommand, reasonOption } from "../helpers.js";

export const kickCommand = defineGuildCommand({
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member from the server.")
    .addUserOption((o) => o.setName("user").setDescription("Member to kick").setRequired(true))
    .addStringOption(reasonOption)
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  async execute(interaction) {
    const member = interaction.options.getMember("user");
    if (!member) {
      await replyError(interaction, "That user is not in this server.");
      return;
    }
    const reason = interaction.options.getString("reason");

    await runModerationAction({
      interaction,
      type: "kick",
      user: member.user,
      member,
      reason,
      perform: () => member.kick(`${interaction.user.tag}: ${reason ?? "No reason"}`),
    });
  },
});
