import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type Message,
} from "discord.js";
import { replyError } from "../../services/moderation.js";
import { sendLog } from "../../services/modlog.js";
import { defineGuildCommand } from "../helpers.js";

const TWO_WEEKS_MS = 14 * 86_400_000;
const LINK_PATTERN = /https?:\/\/\S+/i;

export const purgeCommand = defineGuildCommand({
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Bulk delete recent messages, with optional filters.")
    .addIntegerOption((o) =>
      o
        .setName("amount")
        .setDescription("How many recent messages to scan (1-1000)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(1000),
    )
    .addUserOption((o) => o.setName("user").setDescription("Only messages from this user"))
    .addStringOption((o) => o.setName("contains").setDescription("Only messages containing this text"))
    .addBooleanOption((o) => o.setName("bots").setDescription("Only messages from bots"))
    .addBooleanOption((o) => o.setName("links").setDescription("Only messages with links"))
    .addBooleanOption((o) => o.setName("attachments").setDescription("Only messages with files"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  cooldownSeconds: 5,

  async execute(interaction) {
    const channel = interaction.channel;
    if (!channel || !("bulkDelete" in channel)) {
      await replyError(interaction, "This command can't be used in this channel.");
      return;
    }

    const amount = interaction.options.getInteger("amount", true);
    const user = interaction.options.getUser("user");
    const contains = interaction.options.getString("contains")?.toLowerCase();
    const botsOnly = interaction.options.getBoolean("bots") ?? false;
    const linksOnly = interaction.options.getBoolean("links") ?? false;
    const attachmentsOnly = interaction.options.getBoolean("attachments") ?? false;

    const matches = (message: Message): boolean =>
      !message.pinned &&
      (!user || message.author.id === user.id) &&
      (!contains || message.content.toLowerCase().includes(contains)) &&
      (!botsOnly || message.author.bot) &&
      (!linksOnly || LINK_PATTERN.test(message.content)) &&
      (!attachmentsOnly || message.attachments.size > 0);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let scanned = 0;
    let deleted = 0;
    let before: string | undefined;
    const cutoff = Date.now() - TWO_WEEKS_MS;

    while (scanned < amount) {
      const batch = await channel.messages.fetch({
        limit: Math.min(100, amount - scanned),
        ...(before ? { before } : {}),
      });
      if (batch.size === 0) break;
      scanned += batch.size;
      before = batch.last()?.id;

      const toDelete = batch.filter((m) => m.createdTimestamp > cutoff && matches(m));
      if (toDelete.size > 0) {
        const result = await channel.bulkDelete(toDelete, true);
        deleted += result.size;
      }
      // Everything after this point is older than 14 days, so it can't be bulk deleted.
      if ((batch.last()?.createdTimestamp ?? 0) < cutoff) break;
    }

    await interaction.editReply(
      `🧹 Deleted **${deleted}** message(s) after scanning ${scanned}.` +
        (deleted < scanned ? "\n-# Messages older than 14 days and pinned messages are skipped." : ""),
    );

    if (deleted > 0) {
      await sendLog(interaction.guild, "messageLogChannelId", {
        content: `🧹 <@${interaction.user.id}> purged **${deleted}** message(s) in <#${channel.id}>` +
          (user ? ` from <@${user.id}>` : ""),
      });
    }
  },
});
