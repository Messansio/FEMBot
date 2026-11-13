import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import {
  getLeaderboard,
  getMemberLevel,
  listLevelRewards,
  setLevelXp,
} from "../../services/leveling.js";
import { getGuildSettings, updateGuildSettings } from "../../services/settings.js";
import { defineGuildCommand } from "../helpers.js";

function progressBar(current: number, needed: number, size = 16): string {
  const filled = Math.round((current / needed) * size);
  return "█".repeat(filled) + "░".repeat(size - filled);
}

export const rankCommand = defineGuildCommand({
  data: new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Show your (or someone's) level.")
    .addUserOption((o) => o.setName("user").setDescription("User")),
  cooldownSeconds: 3,

  async execute(interaction) {
    if (!getGuildSettings(interaction.guildId).levelingEnabled) {
      await interaction.reply({ content: "Leveling is disabled in this server.", flags: MessageFlags.Ephemeral });
      return;
    }
    const user = interaction.options.getUser("user") ?? interaction.user;
    const stats = getMemberLevel(interaction.guildId, user.id);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
      .addFields(
        { name: "Level", value: String(stats.level), inline: true },
        { name: "Rank", value: `#${stats.rank}`, inline: true },
        { name: "Total XP", value: stats.xp.toLocaleString("en-US"), inline: true },
        {
          name: `Progress: ${stats.current} / ${stats.needed} XP`,
          value: `\`${progressBar(stats.current, stats.needed)}\``,
        },
      );
    await interaction.reply({ embeds: [embed] });
  },
});

export const leaderboardCommand = defineGuildCommand({
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Top members by XP.")
    .addIntegerOption((o) => o.setName("page").setDescription("Page").setMinValue(1)),
  cooldownSeconds: 5,

  async execute(interaction) {
    const page = interaction.options.getInteger("page") ?? 1;
    const rows = getLeaderboard(interaction.guildId, 10, (page - 1) * 10);
    const medals = ["🥇", "🥈", "🥉"];
    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle(`🏆 Leaderboard: ${interaction.guild.name}`)
      .setDescription(
        rows.length
          ? rows
              .map((row, i) => {
                const position = (page - 1) * 10 + i;
                return `${medals[position] ?? `\`#${position + 1}\``} <@${row.userId}> • Level **${row.level}** • ${row.xp.toLocaleString("en-US")} XP`;
              })
              .join("\n")
          : "_Nobody here yet._",
      )
      .setFooter({ text: `Page ${page}` });
    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
});

export const levelsCommand = defineGuildCommand({
  data: new SlashCommandBuilder()
    .setName("levels")
    .setDescription("Configure the leveling system.")
    .addSubcommand((s) =>
      s
        .setName("toggle")
        .setDescription("Enable or disable leveling")
        .addBooleanOption((o) => o.setName("enabled").setDescription("Enabled").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("announce")
        .setDescription("Where to announce level-ups (empty = same channel)")
        .addChannelOption((o) => o.setName("channel").setDescription("Channel").addChannelTypes(ChannelType.GuildText)),
    )
    .addSubcommandGroup((g) =>
      g
        .setName("reward")
        .setDescription("Role rewards")
        .addSubcommand((s) =>
          s
            .setName("add")
            .setDescription("Give a role when a level is reached")
            .addIntegerOption((o) => o.setName("level").setDescription("Level").setRequired(true).setMinValue(1).setMaxValue(500))
            .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)),
        )
        .addSubcommand((s) =>
          s
            .setName("remove")
            .setDescription("Remove a level reward")
            .addIntegerOption((o) => o.setName("level").setDescription("Level").setRequired(true).setMinValue(1))
            .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)),
        )
        .addSubcommand((s) => s.setName("list").setDescription("List rewards")),
    )
    .addSubcommand((s) =>
      s
        .setName("set-xp")
        .setDescription("Set a member's total XP")
        .addUserOption((o) => o.setName("user").setDescription("User").setRequired(true))
        .addIntegerOption((o) => o.setName("xp").setDescription("Total XP").setRequired(true).setMinValue(0)),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const group = interaction.options.getSubcommandGroup();
    const sub = interaction.options.getSubcommand();
    const reply = (content: string) =>
      interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });

    if (group === "reward") {
      if (sub === "list") {
        const rewards = listLevelRewards(guildId);
        await reply(
          rewards.length ? rewards.map((r) => `Level **${r.level}** → <@&${r.roleId}>`).join("\n") : "No level rewards.",
        );
        return;
      }
      const level = interaction.options.getInteger("level", true);
      const role = interaction.options.getRole("role", true);
      if (sub === "add") {
        const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());
        if (role.managed || role.comparePositionTo(me.roles.highest) >= 0) {
          await reply("❌ I can't assign that role.");
          return;
        }
        db.insert(schema.levelRewards).values({ guildId, level, roleId: role.id }).onConflictDoNothing().run();
        await reply(`✅ Members reaching level **${level}** will get ${role}.`);
      } else {
        db.delete(schema.levelRewards)
          .where(
            and(
              eq(schema.levelRewards.guildId, guildId),
              eq(schema.levelRewards.level, level),
              eq(schema.levelRewards.roleId, role.id),
            ),
          )
          .run();
        await reply(`➖ Removed the level ${level} reward ${role}.`);
      }
      return;
    }

    if (sub === "toggle") {
      const enabled = interaction.options.getBoolean("enabled", true);
      updateGuildSettings(guildId, { levelingEnabled: enabled });
      await reply(`✅ Leveling ${enabled ? "enabled" : "disabled"}.`);
      return;
    }
    if (sub === "announce") {
      const channel = interaction.options.getChannel("channel");
      updateGuildSettings(guildId, { levelUpChannelId: channel?.id ?? null });
      await reply(channel ? `✅ Level-ups will be announced in ${channel}.` : "✅ Level-ups will be announced where the member chatted.");
      return;
    }

    const user = interaction.options.getUser("user", true);
    const xp = interaction.options.getInteger("xp", true);
    setLevelXp(guildId, user.id, xp);
    await reply(`✅ Set ${user}'s XP to ${xp} (level ${getMemberLevel(guildId, user.id).level}).`);
  },
});
