import {
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";

import type { Command } from "../../types/command.js";

export const serverInfoCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("View information about the current server."),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guild) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const guild = interaction.guild;
    const owner = await guild.fetchOwner().catch(() => null);
    const iconUrl = guild.iconURL({ size: 1024 });
    const bannerUrl = guild.bannerURL({ size: 1024 });
    const boostLevel = guild.premiumTier === 0 ? "None" : guild.premiumTier.toString();

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(guild.name)
      .setDescription(`Information about ${guild.name}`)
      .addFields(
        { name: "Server ID", value: guild.id, inline: true },
        { name: "Owner", value: owner ? `<@${owner.id}>` : "Unknown", inline: true },
        { name: "Members", value: String(guild.memberCount), inline: true },
        { name: "Channels", value: String(guild.channels.cache.size), inline: true },
        { name: "Roles", value: String(guild.roles.cache.size), inline: true },
        {
          name: "Created",
          value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`,
          inline: false,
        },
        {
          name: "Boost level",
          value: boostLevel,
          inline: true,
        },
        {
          name: "Verification",
          value: guild.verificationLevel.toString(),
          inline: true,
        },
      );

    if (iconUrl) {
      embed.setThumbnail(iconUrl);
    }

    if (bannerUrl) {
      embed.setImage(bannerUrl);
    }

    embed.setFooter({ text: `Requested by ${interaction.user.tag}` });

    await interaction.reply({ embeds: [embed] });
  },
};
