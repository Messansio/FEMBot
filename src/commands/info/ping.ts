import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../../types/command.js";

export const pingCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check whether the bot is responding."),
  async execute(interaction) {
    await interaction.reply("Pong! 🏓");
  },
};
