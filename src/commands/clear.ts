import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextChannel,
  type ChatInputCommandInteraction,
} from "discord.js";

import type { Command } from "../types/command.js";

export const clearCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Clear messages in a channel.")
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("The number of messages to clear (1-100).")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100),
    )
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user whose messages to clear.")
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const amount = interaction.options.getInteger("amount", true);
    const user = interaction.options.getUser("user", false);

    if (!interaction.channel || !(interaction.channel instanceof TextChannel)) {
      await interaction.reply({
        content: "This command can only be used in text channels.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      const messages = await interaction.channel.messages.fetch({ limit: amount });
      const messagesToDelete = user
        ? messages.filter((msg) => msg.author.id === user.id)
        : messages;

      await interaction.channel.bulkDelete(messagesToDelete);
      await interaction.reply({
        content: `Cleared ${messagesToDelete.size} messages.`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error("Error occurred while clearing messages:", error);
      await interaction.reply({
        content: "An error occurred while clearing messages.",
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};