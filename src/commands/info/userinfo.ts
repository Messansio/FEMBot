import {
  EmbedBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "../../types/command.js";

export const userInfoCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("View information about a user")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to look up")
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const user = interaction.options.getUser("user") ?? interaction.user;
    const member = interaction.guild
      ? await interaction.guild.members.fetch(user.id).catch(() => null)
      : null;

    const embed = new EmbedBuilder()
      .setColor(member?.displayColor ?? 0x5865f2)
      .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
      .setThumbnail(user.displayAvatarURL({ size: 1024 }))
      .setDescription(`Information for <@${user.id}>`)
      .addFields(
        { name: "User ID", value: user.id, inline: true },
        { name: "Type", value: user.bot ? "Bot" : "User", inline: true },
        {
          name: "Account created",
          value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`,
          inline: false,
        },
      );

    if (member) {
      embed.addFields(
        {
          name: "Joined server",
          value: member.joinedTimestamp
            ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`
            : "Unknown",
          inline: true,
        },
        { name: "Nickname", value: member.nickname ?? "None", inline: true },
      );

      const roles = member.roles.cache
        .filter((role) => role.id !== interaction.guildId)
        .map((role) => role.toString());
      const roleText = roles.length > 0 ? roles.join(", ").slice(0, 1024) : "None";
      embed.addFields({ name: `Roles (${roles.length})`, value: roleText });
    }

    embed.setFooter({ text: `Requested by ${interaction.user.tag}` });
    await interaction.reply({ embeds: [embed] });
  },
};
