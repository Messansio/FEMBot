import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type User,
} from "discord.js";
import type { CaseType } from "../../db/schema.js";
import { listCases } from "../../services/cases.js";
import { discordTimestamp } from "../../utils/duration.js";
import { defineGuildCommand } from "../helpers.js";

async function showCases(
  interaction: ChatInputCommandInteraction<"cached">,
  user: User,
  type?: CaseType,
): Promise<void> {
  const { cases, total } = listCases({ guildId: interaction.guildId, targetId: user.id, type, limit: 15 });
  const counts = listCases({ guildId: interaction.guildId, targetId: user.id, limit: 1000 }).cases.reduce<
    Partial<Record<CaseType, number>>
  >((acc, c) => ({ ...acc, [c.type]: (acc[c.type] ?? 0) + 1 }), {});

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({ name: `${user.tag}: ${type ? `${type}s` : "history"}`, iconURL: user.displayAvatarURL() })
    .setDescription(
      cases.length === 0
        ? "_No cases found._"
        : cases
            .map(
              (c) =>
                `\`#${c.caseNumber}\` **${c.type.toUpperCase()}**${c.active ? "" : " ~~(inactive)~~"} ` +
                `${discordTimestamp(c.createdAt, "R")} by <@${c.moderatorId}>\n> ${
                  c.reason?.slice(0, 120) ?? "_No reason_"
                }`,
            )
            .join("\n"),
    )
    .setFooter({
      text:
        Object.entries(counts)
          .map(([key, value]) => `${key}: ${value}`)
          .join(" • ") || "Clean record",
    });
  if (total > cases.length) embed.setTitle(`Showing ${cases.length} of ${total}`);

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

export const historyCommand = defineGuildCommand({
  data: new SlashCommandBuilder()
    .setName("history")
    .setDescription("Show a user's moderation history.")
    .addUserOption((o) => o.setName("user").setDescription("User").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction) {
    await showCases(interaction, interaction.options.getUser("user", true));
  },
});

export const warningsCommand = defineGuildCommand({
  data: new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("Show a user's warnings.")
    .addUserOption((o) => o.setName("user").setDescription("User").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction) {
    await showCases(interaction, interaction.options.getUser("user", true), "warn");
  },
});
