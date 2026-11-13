import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { replyError } from "../../services/moderation.js";
import { updateGuildSettings } from "../../services/settings.js";
import { buildTicketPanel, closeTicket, getTicketByChannel, isTicketStaff } from "../../services/tickets.js";
import { defineGuildCommand } from "../helpers.js";

export const ticketCommand = defineGuildCommand({
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Support ticket system.")
    .addSubcommand((s) =>
      s
        .setName("setup")
        .setDescription("Post the ticket panel. Tickets open as private threads in that channel.")
        .addChannelOption((o) =>
          o.setName("channel").setDescription("Channel for the panel and tickets").setRequired(true).addChannelTypes(ChannelType.GuildText),
        )
        .addRoleOption((o) => o.setName("staff_role").setDescription("Role that handles tickets"))
        .addChannelOption((o) =>
          o.setName("log_channel").setDescription("Where transcripts are sent").addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((s) => s.setName("close").setDescription("Close the current ticket"))
    .addSubcommand((s) =>
      s.setName("add").setDescription("Add a user to this ticket").addUserOption((o) => o.setName("user").setDescription("User").setRequired(true)),
    )
    .addSubcommand((s) =>
      s.setName("remove").setDescription("Remove a user from this ticket").addUserOption((o) => o.setName("user").setDescription("User").setRequired(true)),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "setup") {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
        return replyError(interaction, "You need the Manage Server permission.");
      }
      const channel = interaction.options.getChannel("channel", true, [ChannelType.GuildText]);
      const staffRole = interaction.options.getRole("staff_role");
      const logChannel = interaction.options.getChannel("log_channel");
      const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());
      const perms = channel.permissionsFor(me);
      if (!perms.has([PermissionFlagsBits.CreatePrivateThreads, PermissionFlagsBits.SendMessagesInThreads, PermissionFlagsBits.SendMessages])) {
        return replyError(interaction, `I need Send Messages, Create Private Threads and Send Messages in Threads in ${channel}.`);
      }
      updateGuildSettings(interaction.guildId, {
        ticketChannelId: channel.id,
        ...(staffRole ? { ticketStaffRoleIds: [staffRole.id] } : {}),
        ...(logChannel ? { ticketLogChannelId: logChannel.id } : {}),
      });
      await channel.send(buildTicketPanel());
      await interaction.reply({ content: `✅ Ticket panel posted in ${channel}.`, flags: MessageFlags.Ephemeral });
      return;
    }

    const channel = interaction.channel;
    const ticket = channel ? getTicketByChannel(channel.id) : undefined;
    if (!channel?.isThread() || !ticket || ticket.status !== "open") {
      return replyError(interaction, "Use this inside an open ticket.");
    }
    const isStaff = isTicketStaff(interaction.member);

    if (sub === "close") {
      if (!isStaff && ticket.openerId !== interaction.user.id) {
        return replyError(interaction, "Only staff or the ticket opener can close it.");
      }
      await interaction.reply({ content: "Closing…", flags: MessageFlags.Ephemeral });
      await closeTicket(interaction.guild, channel, interaction.member);
      return;
    }

    if (!isStaff) return replyError(interaction, "Only staff can manage ticket members.");
    const user = interaction.options.getUser("user", true);
    if (sub === "add") await channel.members.add(user.id);
    else await channel.members.remove(user.id);
    await interaction.reply({
      content: `${sub === "add" ? "➕ Added" : "➖ Removed"} ${user} ${sub === "add" ? "to" : "from"} the ticket.`,
      allowedMentions: { parse: [] },
    });
  },
});
