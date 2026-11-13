import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";

import type { Command } from "../../types/command.js";

export const avatarCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("View and download a user's avatar.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user whose avatar you want to view.")
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const user = interaction.options.getUser("user") ?? interaction.user;
    const avatarUrl = user.displayAvatarURL({ size: 4096 });
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`${user.tag}'s avatar`)
      .setImage(avatarUrl);
    const downloadButton = new ButtonBuilder()
      .setLabel("Download avatar")
      .setStyle(ButtonStyle.Link)
      .setURL(avatarUrl);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(downloadButton);

    await interaction.reply({ embeds: [embed], components: [row] });
  },
};