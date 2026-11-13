import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { closeTicket, getTicketByChannel, isTicketStaff, openTicket } from "../services/tickets.js";
import type { ComponentHandler } from "../types/command.js";

/**
 * customIds:
 *   ticket:open   button → shows the topic modal
 *   ticket:modal  modal submit → creates the ticket
 *   ticket:close  button inside a ticket
 */
export const ticketHandler: ComponentHandler = {
  prefix: "ticket",
  async execute(interaction, args) {
    if (!interaction.inCachedGuild()) return;
    const action = args[0];

    if (action === "open" && interaction.isButton()) {
      const modal = new ModalBuilder()
        .setCustomId("ticket:modal")
        .setTitle("Open a ticket")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("topic")
              .setLabel("What do you need help with?")
              .setStyle(TextInputStyle.Paragraph)
              .setMaxLength(500)
              .setRequired(false),
          ),
        );
      await interaction.showModal(modal);
      return;
    }

    if (action === "modal" && interaction.isModalSubmit()) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const topic = interaction.fields.getTextInputValue("topic").trim() || null;
        const thread = await openTicket(interaction.member, topic);
        await interaction.editReply(`✅ Your ticket is open: ${thread}`);
      } catch (error) {
        await interaction.editReply(`❌ ${error instanceof Error ? error.message : "Couldn't open a ticket."}`);
      }
      return;
    }

    if (action === "close" && interaction.isButton()) {
      const channel = interaction.channel;
      const ticket = channel ? getTicketByChannel(channel.id) : undefined;
      if (!channel?.isThread() || !ticket) return;
      if (ticket.openerId !== interaction.user.id && !isTicketStaff(interaction.member)) {
        await interaction.reply({ content: "Only staff or the ticket opener can close it.", flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.deferUpdate();
      try {
        await closeTicket(interaction.guild, channel, interaction.member);
      } catch (error) {
        await interaction.followUp({
          content: `❌ ${error instanceof Error ? error.message : "Couldn't close the ticket."}`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }
  },
};
