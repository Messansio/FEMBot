import {
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";

import type { Command } from "../../types/command.js";

const numberEmojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];

export const pollCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Create a poll with up to five choices.")
    .addStringOption((option) =>
      option
        .setName("question")
        .setDescription("What do you want to ask?")
        .setRequired(true)
        .setMaxLength(256),
    )
    .addStringOption((option) =>
      option
        .setName("choice1")
        .setDescription("First choice")
        .setRequired(true)
        .setMaxLength(100),
    )
    .addStringOption((option) =>
      option
        .setName("choice2")
        .setDescription("Second choice")
        .setRequired(true)
        .setMaxLength(100),
    )
    .addStringOption((option) =>
      option
        .setName("choice3")
        .setDescription("Optional third choice")
        .setRequired(false)
        .setMaxLength(100),
    )
    .addStringOption((option) =>
      option
        .setName("choice4")
        .setDescription("Optional fourth choice")
        .setRequired(false)
        .setMaxLength(100),
    )
    .addStringOption((option) =>
      option
        .setName("choice5")
        .setDescription("Optional fifth choice")
        .setRequired(false)
        .setMaxLength(100),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const question = interaction.options.getString("question", true);
    const choices = [1, 2, 3, 4, 5]
      .map((number) =>
        interaction.options.getString(`choice${number}`, number <= 2),
      )
      .filter((choice): choice is string => choice !== null);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📊 ${question}`)
      .setDescription(
        choices.map((choice, index) => `${numberEmojis[index]} ${choice}`).join("\n"),
      )
      .setFooter({ text: `Poll created by ${interaction.user.tag}` });

    await interaction.reply({ embeds: [embed] });

    try {
      const pollMessage = await interaction.fetchReply();
      for (const emoji of numberEmojis.slice(0, choices.length)) {
        await pollMessage.react(emoji);
      }
    } catch (error) {
      console.error("Failed to add poll reactions:", error);
      await interaction.followUp({
        content:
          "The poll was posted, but I couldn't add its voting reactions. Please check that I have permission to add reactions.",
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};