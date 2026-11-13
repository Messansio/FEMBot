import {
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import { getGuildSettings } from "./settings.js";

export type ModerationCheck = { ok: true } | { ok: false; reason: string };

/**
 * Validates that `moderator` may act on `target`, and that the bot can too.
 * Works with role hierarchy, server owner and self-targeting rules.
 */
export function canModerate(
  moderator: GuildMember,
  target: GuildMember,
  botMember: GuildMember,
): ModerationCheck {
  const guild = target.guild;

  if (target.id === moderator.id) return { ok: false, reason: "You can't moderate yourself." };
  if (target.id === botMember.id) return { ok: false, reason: "I can't moderate myself." };
  if (target.id === guild.ownerId) {
    return { ok: false, reason: "The server owner can't be moderated." };
  }
  if (
    moderator.id !== guild.ownerId &&
    target.roles.highest.comparePositionTo(moderator.roles.highest) >= 0
  ) {
    return {
      ok: false,
      reason: "That member's highest role is equal to or above yours.",
    };
  }
  if (target.roles.highest.comparePositionTo(botMember.roles.highest) >= 0) {
    return {
      ok: false,
      reason: "That member's highest role is equal to or above mine. Move my role higher.",
    };
  }
  return { ok: true };
}

/** True when the member is an admin, has the given permission, or holds a configured mod role. */
export function isModerator(member: GuildMember, permission: bigint): boolean {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions.has(permission)) return true;
  const { modRoleIds } = getGuildSettings(member.guild.id);
  return modRoleIds.some((roleId) => member.roles.cache.has(roleId));
}

/** Resolves the invoking member and the bot member for a guild command. */
export async function getGuildMembers(
  interaction: ChatInputCommandInteraction,
): Promise<{ moderator: GuildMember; botMember: GuildMember } | null> {
  if (!interaction.inCachedGuild()) return null;
  return {
    moderator: interaction.member,
    botMember: interaction.guild.members.me ?? (await interaction.guild.members.fetchMe()),
  };
}
