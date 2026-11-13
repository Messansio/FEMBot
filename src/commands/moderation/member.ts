import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { replyError } from "../../services/moderation.js";
import { canModerate } from "../../services/permissions.js";
import { defineGuildCommand } from "../helpers.js";

export const roleCommand = defineGuildCommand({
  data: new SlashCommandBuilder()
    .setName("role")
    .setDescription("Add or remove a role from a member.")
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Give a role")
        .addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true))
        .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Remove a role")
        .addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true))
        .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    const member = interaction.options.getMember("user");
    const role = interaction.options.getRole("role", true);
    const adding = interaction.options.getSubcommand() === "add";
    const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());

    if (!member) return replyError(interaction, "That user is not in this server.");
    if (role.managed || role.id === interaction.guildId) {
      return replyError(interaction, "That role is managed by an integration and can't be assigned.");
    }
    if (interaction.user.id !== interaction.guild.ownerId &&
      role.comparePositionTo(interaction.member.roles.highest) >= 0) {
      return replyError(interaction, "That role is equal to or above your highest role.");
    }
    if (role.comparePositionTo(me.roles.highest) >= 0) {
      return replyError(interaction, "That role is equal to or above my highest role.");
    }

    try {
      if (adding) await member.roles.add(role, `By ${interaction.user.tag}`);
      else await member.roles.remove(role, `By ${interaction.user.tag}`);
    } catch {
      return replyError(interaction, "I couldn't update that member's roles.");
    }
    await interaction.reply({
      content: `✅ ${adding ? "Gave" : "Removed"} ${role} ${adding ? "to" : "from"} ${member}.`,
      allowedMentions: { parse: [] },
    });
  },
});

export const nickCommand = defineGuildCommand({
  data: new SlashCommandBuilder()
    .setName("nick")
    .setDescription("Change or reset a member's nickname.")
    .addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true))
    .addStringOption((o) =>
      o.setName("nickname").setDescription("New nickname (empty = reset)").setMaxLength(32),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),

  async execute(interaction) {
    const member = interaction.options.getMember("user");
    if (!member) return replyError(interaction, "That user is not in this server.");
    const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());
    if (member.id !== interaction.user.id) {
      const check = canModerate(interaction.member, member, me);
      if (!check.ok) return replyError(interaction, check.reason);
    }
    const nickname = interaction.options.getString("nickname");
    try {
      await member.setNickname(nickname, `By ${interaction.user.tag}`);
    } catch {
      return replyError(interaction, "I couldn't change that nickname.");
    }
    await interaction.reply({
      content: nickname ? `✏️ ${member}'s nickname is now **${nickname}**.` : `✏️ Reset ${member}'s nickname.`,
      allowedMentions: { parse: [] },
    });
  },
});
