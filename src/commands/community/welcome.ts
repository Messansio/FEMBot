import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { getGuildSettings, renderTemplate, updateGuildSettings } from "../../services/settings.js";
import { defineGuildCommand } from "../helpers.js";

const placeholderHelp = "Placeholders: {user} {username} {tag} {server} {memberCount}";

export const welcomeCommand = defineGuildCommand({
  data: new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("Configure welcome and leave messages.")
    .addSubcommand((s) =>
      s
        .setName("set")
        .setDescription("Enable welcome or leave messages")
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("Message type")
            .setRequired(true)
            .addChoices({ name: "welcome", value: "welcome" }, { name: "leave", value: "leave" }),
        )
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Channel")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        )
        .addStringOption((o) =>
          o.setName("message").setDescription(placeholderHelp).setMaxLength(1500),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("disable")
        .setDescription("Disable welcome or leave messages")
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("Message type")
            .setRequired(true)
            .addChoices({ name: "welcome", value: "welcome" }, { name: "leave", value: "leave" }),
        ),
    )
    .addSubcommand((s) => s.setName("test").setDescription("Preview the welcome and leave messages with you as the member"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "set") {
      const type = interaction.options.getString("type", true);
      const channel = interaction.options.getChannel("channel", true);
      const message = interaction.options.getString("message");
      updateGuildSettings(
        guildId,
        type === "welcome"
          ? { welcomeEnabled: true, welcomeChannelId: channel.id, ...(message ? { welcomeMessage: message } : {}) }
          : { leaveEnabled: true, leaveChannelId: channel.id, ...(message ? { leaveMessage: message } : {}) },
      );
      await interaction.reply({
        content: `✅ ${type} messages enabled in ${channel}.\n-# ${placeholderHelp}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === "disable") {
      const type = interaction.options.getString("type", true);
      updateGuildSettings(guildId, type === "welcome" ? { welcomeEnabled: false } : { leaveEnabled: false });
      await interaction.reply({ content: `✅ ${type} messages disabled.`, flags: MessageFlags.Ephemeral });
      return;
    }

    const settings = getGuildSettings(guildId);
    const values = {
      user: `<@${interaction.user.id}>`,
      username: interaction.user.username,
      tag: interaction.user.tag,
      server: interaction.guild.name,
      memberCount: interaction.guild.memberCount,
    };
    await interaction.reply({
      content: [
        `**Welcome** (${settings.welcomeEnabled ? "on" : "off"}):`,
        renderTemplate(settings.welcomeMessage, values),
        "",
        `**Leave** (${settings.leaveEnabled ? "on" : "off"}):`,
        renderTemplate(settings.leaveMessage, values),
      ].join("\n"),
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  },
});

export const autoroleCommand = defineGuildCommand({
  data: new SlashCommandBuilder()
    .setName("autorole")
    .setDescription("Roles given automatically to new members.")
    .addSubcommand((s) =>
      s.setName("add").setDescription("Add an autorole").addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)),
    )
    .addSubcommand((s) =>
      s.setName("remove").setDescription("Remove an autorole").addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)),
    )
    .addSubcommand((s) => s.setName("list").setDescription("List autoroles"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const current = getGuildSettings(interaction.guildId).autoroleIds;
    const reply = (content: string) =>
      interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });

    if (sub === "list") {
      await reply(current.length ? `Autoroles: ${current.map((id) => `<@&${id}>`).join(" ")}` : "No autoroles set.");
      return;
    }

    const role = interaction.options.getRole("role", true);
    if (sub === "add") {
      const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());
      if (role.managed || role.id === interaction.guildId || role.comparePositionTo(me.roles.highest) >= 0) {
        await reply("❌ I can't assign that role (it's managed or above my highest role).");
        return;
      }
      if (current.includes(role.id)) {
        await reply("That role is already an autorole.");
        return;
      }
      if (current.length >= 10) {
        await reply("❌ You can have at most 10 autoroles.");
        return;
      }
      updateGuildSettings(interaction.guildId, { autoroleIds: [...current, role.id] });
      await reply(`➕ ${role} will be given to new members.`);
      return;
    }

    updateGuildSettings(interaction.guildId, { autoroleIds: current.filter((id) => id !== role.id) });
    await reply(`➖ ${role} removed from autoroles.`);
  },
});
