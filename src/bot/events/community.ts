import {
  AuditLogEvent,
  EmbedBuilder,
  Events,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type PartialGuildMember,
} from "discord.js";
import { createCase, deactivateCases } from "../../services/cases.js";
import { handleMessageXp } from "../../services/leveling.js";
import { logCase, sendLog } from "../../services/modlog.js";
import { getGuildSettings, renderTemplate } from "../../services/settings.js";
import { discordTimestamp } from "../../utils/duration.js";
import { defineEvent } from "./types.js";

function memberTemplateValues(member: GuildMember | PartialGuildMember) {
  return {
    user: `<@${member.id}>`,
    username: member.user.username,
    tag: member.user.tag,
    server: member.guild.name,
    memberCount: member.guild.memberCount,
  };
}

async function sendToChannel(guild: Guild, channelId: string | null, content: string, mentionId?: string) {
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return;
  await channel
    .send({ content, allowedMentions: { users: mentionId ? [mentionId] : [] } })
    .catch((error: unknown) => console.warn(`Failed to send to ${channelId}:`, error));
}

export const memberAddEvent = defineEvent({
  name: Events.GuildMemberAdd,
  async execute(member) {
    const settings = getGuildSettings(member.guild.id);

    if (settings.welcomeEnabled) {
      await sendToChannel(
        member.guild,
        settings.welcomeChannelId,
        renderTemplate(settings.welcomeMessage, memberTemplateValues(member)),
        member.id,
      );
    }

    const me = member.guild.members.me;
    if (settings.autoroleIds.length > 0 && me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      const roles = settings.autoroleIds.filter((id) => {
        const role = member.guild.roles.cache.get(id);
        return role && !role.managed && role.comparePositionTo(me.roles.highest) < 0;
      });
      // Members must pass membership screening before roles can be added.
      if (roles.length > 0 && !member.pending) {
        await member.roles.add(roles, "Autorole").catch((error: unknown) => {
          console.warn("Failed to add autoroles:", error);
        });
      }
    }

    await sendLog(member.guild, "memberLogChannelId", {
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setAuthor({ name: `${member.user.tag} joined`, iconURL: member.displayAvatarURL() })
          .setDescription(`<@${member.id}> • Account created ${discordTimestamp(member.user.createdTimestamp, "R")}`)
          .setFooter({ text: `ID: ${member.id} • Members: ${member.guild.memberCount}` })
          .setTimestamp(),
      ],
    });
  },
});

/** Applies autoroles once a member passes membership screening. */
export const memberUpdateEvent = defineEvent({
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember) {
    if (!oldMember.pending || newMember.pending) return;
    const { autoroleIds } = getGuildSettings(newMember.guild.id);
    if (autoroleIds.length === 0) return;
    await newMember.roles.add(autoroleIds, "Autorole (screening passed)").catch(() => undefined);
  },
});

export const memberRemoveEvent = defineEvent({
  name: Events.GuildMemberRemove,
  async execute(member) {
    const settings = getGuildSettings(member.guild.id);
    if (settings.leaveEnabled) {
      await sendToChannel(
        member.guild,
        settings.leaveChannelId,
        renderTemplate(settings.leaveMessage, memberTemplateValues(member)),
      );
    }

    const roles = member.roles.cache
      .filter((role) => role.id !== member.guild.id)
      .map((role) => role.toString())
      .join(" ");
    await sendLog(member.guild, "memberLogChannelId", {
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setAuthor({ name: `${member.user.tag} left`, iconURL: member.displayAvatarURL() })
          .setDescription(
            `<@${member.id}>` +
              (member.joinedTimestamp ? ` • Joined ${discordTimestamp(member.joinedTimestamp, "R")}` : ""),
          )
          .addFields(roles ? [{ name: "Roles", value: roles.slice(0, 1024) }] : [])
          .setFooter({ text: `ID: ${member.id}` })
          .setTimestamp(),
      ],
    });
  },
});

export const messageCreateEvent = defineEvent({
  name: Events.MessageCreate,
  async execute(message) {
    if (!message.inGuild() || message.author.bot || message.system) return;
    await handleMessageXp(message);
  },
});

export const messageDeleteEvent = defineEvent({
  name: Events.MessageDelete,
  async execute(message) {
    if (!message.inGuild() || message.author?.bot) return;
    const settings = getGuildSettings(message.guildId);
    if (!settings.messageLogChannelId || message.channelId === settings.messageLogChannelId) return;

    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("Message deleted")
      .setDescription(message.content?.slice(0, 4000) || "_Content not cached_")
      .addFields({ name: "Channel", value: `<#${message.channelId}>`, inline: true })
      .setFooter({ text: `Message ID: ${message.id}` })
      .setTimestamp();
    if (message.author) {
      embed.setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() });
      embed.addFields({ name: "Author", value: `<@${message.author.id}>`, inline: true });
    }
    if (message.attachments.size > 0) {
      embed.addFields({
        name: "Attachments",
        value: message.attachments.map((a) => a.name).join(", ").slice(0, 1024),
      });
    }
    await sendLog(message.guild, "messageLogChannelId", { embeds: [embed] });
  },
});

export const messageUpdateEvent = defineEvent({
  name: Events.MessageUpdate,
  async execute(oldMessage, newMessage) {
    if (!newMessage.inGuild() || newMessage.author.bot) return;
    if (oldMessage.content === newMessage.content || oldMessage.partial) return;
    const settings = getGuildSettings(newMessage.guildId);
    if (!settings.messageLogChannelId) return;

    await sendLog(newMessage.guild, "messageLogChannelId", {
      embeds: [
        new EmbedBuilder()
          .setColor(0xfee75c)
          .setAuthor({ name: newMessage.author.tag, iconURL: newMessage.author.displayAvatarURL() })
          .setTitle("Message edited")
          .setURL(newMessage.url)
          .addFields(
            { name: "Before", value: oldMessage.content?.slice(0, 1024) || "_empty_" },
            { name: "After", value: newMessage.content.slice(0, 1024) || "_empty_" },
            { name: "Channel", value: `<#${newMessage.channelId}>`, inline: true },
            { name: "Author", value: `<@${newMessage.author.id}>`, inline: true },
          )
          .setTimestamp(),
      ],
    });
  },
});

/** Records bans/unbans done through Discord's UI (not via the bot) as cases. */
async function findAuditExecutor(guild: Guild, type: AuditLogEvent.MemberBanAdd | AuditLogEvent.MemberBanRemove, targetId: string) {
  if (!guild.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) return null;
  const logs = await guild.fetchAuditLogs({ type, limit: 5 }).catch(() => null);
  return (
    logs?.entries.find(
      (entry) => entry.targetId === targetId && Date.now() - entry.createdTimestamp < 15_000,
    ) ?? null
  );
}

export const banAddEvent = defineEvent({
  name: Events.GuildBanAdd,
  async execute(ban) {
    const entry = await findAuditExecutor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
    if (!entry?.executorId || entry.executorId === ban.client.user.id) return;
    const modCase = createCase({
      guildId: ban.guild.id,
      type: "ban",
      targetId: ban.user.id,
      targetTag: ban.user.tag,
      moderatorId: entry.executorId,
      reason: entry.reason ?? ban.reason ?? null,
    });
    await logCase(ban.guild, modCase);
  },
});

export const banRemoveEvent = defineEvent({
  name: Events.GuildBanRemove,
  async execute(ban) {
    const entry = await findAuditExecutor(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
    if (!entry?.executorId || entry.executorId === ban.client.user.id) return;
    deactivateCases(ban.guild.id, ban.user.id, "ban");
    const modCase = createCase({
      guildId: ban.guild.id,
      type: "unban",
      targetId: ban.user.id,
      targetTag: ban.user.tag,
      moderatorId: entry.executorId,
      reason: entry.reason ?? null,
    });
    await logCase(ban.guild, modCase);
  },
});
