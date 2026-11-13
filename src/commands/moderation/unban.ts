import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { deactivateCases } from "../../services/cases.js";
import { replyError, runModerationAction } from "../../services/moderation.js";
import { cancelScheduledUnban } from "../../services/scheduler.js";
import { defineGuildCommand, reasonOption } from "../helpers.js";

export const unbanCommand = defineGuildCommand({
  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user.")
    .addStringOption((o) =>
      o
        .setName("user")
        .setDescription("Banned user (start typing to search)")
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addStringOption(reasonOption)
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async autocomplete(interaction) {
    if (!interaction.inCachedGuild()) return;
    const query = interaction.options.getFocused().toLowerCase();
    const bans = await interaction.guild.bans.fetch({ limit: 1000 }).catch(() => null);
    const choices = (bans ? [...bans.values()] : [])
      .filter(
        (ban) => ban.user.tag.toLowerCase().includes(query) || ban.user.id.startsWith(query),
      )
      .slice(0, 25)
      .map((ban) => ({ name: `${ban.user.tag} (${ban.user.id})`.slice(0, 100), value: ban.user.id }));
    await interaction.respond(choices);
  },

  async execute(interaction) {
    const userId = interaction.options.getString("user", true).trim();
    const reason = interaction.options.getString("reason");

    const ban = await interaction.guild.bans.fetch(userId).catch(() => null);
    if (!ban) {
      await replyError(interaction, "That user is not banned.");
      return;
    }

    await runModerationAction({
      interaction,
      type: "unban",
      user: ban.user,
      reason,
      perform: () =>
        interaction.guild.bans.remove(userId, `${interaction.user.tag}: ${reason ?? "No reason"}`),
      afterCase: () => {
        cancelScheduledUnban(interaction.guildId, userId);
        deactivateCases(interaction.guildId, userId, "ban");
      },
    });
  },
});
