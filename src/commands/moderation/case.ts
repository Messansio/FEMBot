import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { deleteCase, getCase, updateCase } from "../../services/cases.js";
import { replyError } from "../../services/moderation.js";
import { buildCaseEmbed } from "../../services/modlog.js";
import { getGuildSettings } from "../../services/settings.js";
import { defineGuildCommand } from "../helpers.js";

export const caseCommand = defineGuildCommand({
  data: new SlashCommandBuilder()
    .setName("case")
    .setDescription("View or manage moderation cases.")
    .addSubcommand((s) =>
      s
        .setName("view")
        .setDescription("View a case")
        .addIntegerOption((o) => o.setName("number").setDescription("Case number").setRequired(true).setMinValue(1)),
    )
    .addSubcommand((s) =>
      s
        .setName("reason")
        .setDescription("Change a case's reason")
        .addIntegerOption((o) => o.setName("number").setDescription("Case number").setRequired(true).setMinValue(1))
        .addStringOption((o) => o.setName("reason").setDescription("New reason").setRequired(true).setMaxLength(512)),
    )
    .addSubcommand((s) =>
      s
        .setName("delete")
        .setDescription("Delete a case (e.g. remove a warning)")
        .addIntegerOption((o) => o.setName("number").setDescription("Case number").setRequired(true).setMinValue(1)),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const number = interaction.options.getInteger("number", true);
    const modCase = getCase(interaction.guildId, number);
    if (!modCase) {
      await replyError(interaction, `Case #${number} doesn't exist.`);
      return;
    }

    if (sub === "view") {
      await interaction.reply({ embeds: [buildCaseEmbed(modCase)], flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === "reason") {
      const updated = updateCase(modCase.id, { reason: interaction.options.getString("reason", true) });
      if (updated) {
        // Keep the original log message in sync.
        const channelId = getGuildSettings(interaction.guildId).modLogChannelId;
        const channel = channelId ? interaction.guild.channels.cache.get(channelId) : undefined;
        if (updated.logMessageId && channel?.isTextBased()) {
          await channel.messages
            .edit(updated.logMessageId, { embeds: [buildCaseEmbed(updated)] })
            .catch(() => undefined);
        }
      }
      await interaction.reply({ content: `✅ Updated reason for case #${number}.`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
      await replyError(interaction, "Deleting cases requires the Manage Server permission.");
      return;
    }
    deleteCase(modCase.id);
    await interaction.reply({ content: `🗑️ Deleted case #${number}.`, flags: MessageFlags.Ephemeral });
  },
});
