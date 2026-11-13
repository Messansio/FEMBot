import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { config as appConfig } from "../../config.js";
import { getGuildSettings, updateGuildSettings } from "../../services/settings.js";
import { defineGuildCommand } from "../helpers.js";

const channel = (id: string | null) => (id ? `<#${id}>` : "_not set_");
const roles = (ids: string[]) => (ids.length ? ids.map((id) => `<@&${id}>`).join(" ") : "_none_");

const logTypes = {
  moderation: "modLogChannelId",
  messages: "messageLogChannelId",
  members: "memberLogChannelId",
  tickets: "ticketLogChannelId",
} as const;

export const configCommand = defineGuildCommand({
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("Configure the bot for this server.")
    .addSubcommand((s) => s.setName("view").setDescription("Show the current configuration"))
    .addSubcommand((s) =>
      s
        .setName("logs")
        .setDescription("Set or clear a log channel")
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("Which log")
            .setRequired(true)
            .addChoices(...Object.keys(logTypes).map((key) => ({ name: key, value: key }))),
        )
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Channel (empty = disable)")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("modrole")
        .setDescription("Add or remove a moderator role")
        .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("dm")
        .setDescription("DM users when they are punished")
        .addBooleanOption((o) => o.setName("enabled").setDescription("Enabled").setRequired(true)),
    )
    .addSubcommand((s) => s.setName("dashboard").setDescription("Get the web dashboard link"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const ephemeral = { flags: MessageFlags.Ephemeral as const, allowedMentions: { parse: [] } };

    if (sub === "logs") {
      const type = interaction.options.getString("type", true) as keyof typeof logTypes;
      const target = interaction.options.getChannel("channel");
      updateGuildSettings(guildId, { [logTypes[type]]: target?.id ?? null });
      await interaction.reply({
        content: target ? `✅ ${type} logs will be sent to ${target}.` : `✅ ${type} logs disabled.`,
        ...ephemeral,
      });
      return;
    }

    if (sub === "modrole") {
      const role = interaction.options.getRole("role", true);
      const current = getGuildSettings(guildId).modRoleIds;
      const removing = current.includes(role.id);
      updateGuildSettings(guildId, {
        modRoleIds: removing ? current.filter((id) => id !== role.id) : [...current, role.id],
      });
      await interaction.reply({
        content: removing ? `➖ ${role} is no longer a moderator role.` : `➕ ${role} is now a moderator role.`,
        ...ephemeral,
      });
      return;
    }

    if (sub === "dm") {
      const enabled = interaction.options.getBoolean("enabled", true);
      updateGuildSettings(guildId, { dmOnPunish: enabled });
      await interaction.reply({ content: `✅ Punishment DMs ${enabled ? "enabled" : "disabled"}.`, ...ephemeral });
      return;
    }

    if (sub === "dashboard") {
      await interaction.reply({
        content: `🌐 Manage this server at ${appConfig.dashboardUrl}/guilds/${guildId}`,
        ...ephemeral,
      });
      return;
    }

    const s = getGuildSettings(guildId);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`Configuration: ${interaction.guild.name}`)
      .addFields(
        {
          name: "Logs",
          value: [
            `Moderation: ${channel(s.modLogChannelId)}`,
            `Messages: ${channel(s.messageLogChannelId)}`,
            `Members: ${channel(s.memberLogChannelId)}`,
            `Tickets: ${channel(s.ticketLogChannelId)}`,
          ].join("\n"),
        },
        { name: "Moderation", value: `Mod roles: ${roles(s.modRoleIds)}\nDM on punish: ${s.dmOnPunish ? "on" : "off"}` },
        {
          name: "Welcome / leave",
          value: `Welcome: ${s.welcomeEnabled ? channel(s.welcomeChannelId) : "off"}\nLeave: ${
            s.leaveEnabled ? channel(s.leaveChannelId) : "off"
          }\nAutoroles: ${roles(s.autoroleIds)}`,
        },
        {
          name: "Leveling",
          value: s.levelingEnabled
            ? `On • ${s.xpMin}-${s.xpMax} XP / ${s.xpCooldownSeconds}s • announce: ${
                s.levelUpChannelId ? channel(s.levelUpChannelId) : "same channel"
              }`
            : "off",
        },
        {
          name: "Tickets",
          value: `Channel: ${channel(s.ticketChannelId)}\nStaff: ${roles(s.ticketStaffRoleIds)}`,
        },
      )
      .setFooter({ text: "Use the dashboard for the full editor: /config dashboard" });
    await interaction.reply({ embeds: [embed], ...ephemeral });
  },
});
