import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  type Guild,
  type GuildMember,
  type Message,
  type ThreadChannel,
} from "discord.js";
import { and, count, eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import type { Ticket } from "../db/schema.js";
import { sendLog } from "./modlog.js";
import { getGuildSettings } from "./settings.js";

export function buildTicketPanel(): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🎫 Support")
        .setDescription("Need help from the staff? Press the button below to open a private ticket."),
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("ticket:open").setLabel("Open ticket").setEmoji("🎫").setStyle(ButtonStyle.Primary),
      ),
    ],
  };
}

export function getTicketByChannel(channelId: string): Ticket | undefined {
  return db.select().from(schema.tickets).where(eq(schema.tickets.channelId, channelId)).get();
}

export function countOpenTickets(guildId: string, openerId?: string): number {
  return (
    db
      .select({ value: count() })
      .from(schema.tickets)
      .where(
        and(
          eq(schema.tickets.guildId, guildId),
          eq(schema.tickets.status, "open"),
          openerId ? eq(schema.tickets.openerId, openerId) : undefined,
        ),
      )
      .get()?.value ?? 0
  );
}

export function isTicketStaff(member: GuildMember): boolean {
  const { ticketStaffRoleIds } = getGuildSettings(member.guild.id);
  return (
    member.permissions.has("ManageThreads") ||
    ticketStaffRoleIds.some((roleId) => member.roles.cache.has(roleId))
  );
}

/** Opens a ticket as a private thread in the configured ticket channel. */
export async function openTicket(member: GuildMember, topic: string | null): Promise<ThreadChannel> {
  const settings = getGuildSettings(member.guild.id);
  if (!settings.ticketChannelId) throw new Error("Tickets are not set up. Ask an admin to run /ticket setup.");

  if (countOpenTickets(member.guild.id, member.id) >= settings.ticketMaxOpenPerUser) {
    throw new Error("You already have the maximum number of open tickets.");
  }

  const parent = member.guild.channels.cache.get(settings.ticketChannelId);
  if (parent?.type !== ChannelType.GuildText) throw new Error("The ticket channel is missing or invalid.");

  const thread = await parent.threads.create({
    name: `ticket-${member.user.username}`.slice(0, 100),
    type: ChannelType.PrivateThread,
    invitable: false,
    reason: `Ticket opened by ${member.user.tag}`,
  });

  db.insert(schema.tickets)
    .values({ guildId: member.guild.id, channelId: thread.id, openerId: member.id, topic })
    .run();

  await thread.members.add(member.id);
  const staffMentions = settings.ticketStaffRoleIds.map((id) => `<@&${id}>`).join(" ");
  await thread.send({
    content: `${member} ${staffMentions}`.trim(),
    // Mentioning staff roles adds their members to the private thread.
    allowedMentions: { users: [member.id], roles: settings.ticketStaffRoleIds },
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("Ticket opened")
        .setDescription(`${topic ? `**Topic:** ${topic}\n\n` : ""}Staff will be with you shortly. Describe your issue here.`),
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("ticket:close").setLabel("Close").setEmoji("🔒").setStyle(ButtonStyle.Danger),
      ),
    ],
  });

  await sendLog(member.guild, "ticketLogChannelId", {
    content: `🎫 Ticket ${thread} opened by <@${member.id}>${topic ? `: ${topic}` : ""}`,
  });
  return thread;
}

async function buildTranscript(thread: ThreadChannel): Promise<string> {
  const messages: Message[] = [];
  let before: string | undefined;
  while (messages.length < 1000) {
    const batch = await thread.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (batch.size === 0) break;
    messages.push(...batch.values());
    before = batch.last()?.id;
  }
  return messages
    .reverse()
    .map((m) => {
      const attachments = m.attachments.map((a) => ` [${a.url}]`).join("");
      return `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}${attachments}`;
    })
    .join("\n");
}

export async function closeTicket(guild: Guild, thread: ThreadChannel, closedBy: GuildMember): Promise<void> {
  const ticket = getTicketByChannel(thread.id);
  if (!ticket || ticket.status === "closed") throw new Error("This isn't an open ticket.");

  db.update(schema.tickets)
    .set({ status: "closed", closedAt: new Date(), closedById: closedBy.id })
    .where(eq(schema.tickets.id, ticket.id))
    .run();

  const transcript = await buildTranscript(thread).catch(() => "Transcript unavailable.");
  await sendLog(guild, "ticketLogChannelId", {
    content: `🔒 Ticket **${thread.name}** (opened by <@${ticket.openerId}>) closed by <@${closedBy.id}>`,
    files: [
      new AttachmentBuilder(Buffer.from(transcript, "utf8"), { name: `transcript-${thread.name}.txt` }),
    ],
  });

  await thread.send(`🔒 Ticket closed by ${closedBy}.`);
  await thread.setLocked(true, "Ticket closed");
  await thread.setArchived(true, "Ticket closed");
}
