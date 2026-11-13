import {
  ActionRowBuilder,
  AttachmentBuilder,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type { ModalSubmitInteraction } from "discord.js";
import type { Command } from "../types/command.js";
import { reviewCode } from "../codeReviewWorker.js";

const MAX_FILE_BYTES = 100_000;
const MODAL_TIMEOUT_MS = 15 * 60 * 1000;

async function buildReply(code: string, filename?: string) {
  const review = await reviewCode(code, filename);
  const details = review.errorLines.map((line) => {
    const message = review.messages[String(line)] ?? "flagged by the model";
    return `• Line ${line}: ${message.slice(0, 200)}`;
  });
  const verdict = review.errorLines.length
    ? `🔴 Lines with errors: ${review.errorLines.join(", ")}\n${details.join("\n")}`
    : "✅ No errors found.";
  return {
    content: `**Language:** ${review.language}\n${verdict}`.slice(0, 2000),
    files: [new AttachmentBuilder(review.image, { name: "code-review.png" })],
  };
}

async function replyFromModal(submit: ModalSubmitInteraction): Promise<void> {
  await submit.deferReply();
  try {
    const code = submit.fields.getTextInputValue("code");
    const filename = submit.fields.getTextInputValue("filename").trim() || undefined;
    await submit.editReply(await buildReply(code, filename));
  } catch (error) {
    console.error("Code review failed:", error);
    await submit.editReply(`Code review failed: ${(error as Error).message}`);
  }
}

export const codeReviewCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("code-review")
    .setDescription("Review code and highlight the lines with errors.")
    .addAttachmentOption((option) =>
      option
        .setName("file")
        .setDescription("A code file. Leave empty to paste code instead."),
    ),

  async execute(interaction) {
    const file = interaction.options.getAttachment("file");

    if (file) {
      if (file.size > MAX_FILE_BYTES) {
        await interaction.reply({
          content: `File too large (max ${MAX_FILE_BYTES / 1000} KB).`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await interaction.deferReply();
      const response = await fetch(file.url);
      if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
      await interaction.editReply(await buildReply(await response.text(), file.name));
      return;
    }

    const modalId = `code-review:${interaction.id}`;
    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(modalId)
        .setTitle("Code review")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("code")
              .setLabel("Code")
              .setStyle(TextInputStyle.Paragraph)
              .setMaxLength(4000)
              .setRequired(true),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("filename")
              .setLabel("File name (optional, e.g. main.py)")
              .setStyle(TextInputStyle.Short)
              .setMaxLength(100)
              .setRequired(false),
          ),
        ),
    );

    const submit = await interaction
      .awaitModalSubmit({
        time: MODAL_TIMEOUT_MS,
        filter: (i) => i.customId === modalId && i.user.id === interaction.user.id,
      })
      .catch(() => undefined); // closed or timed out
    if (submit) await replyFromModal(submit);
  },
};
