import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  AnySelectMenuInteraction,
} from "discord.js";

export type CommandCategory = "info" | "utility" | "moderation" | "community";

export interface Command {
  data:
    | SlashCommandBuilder
    | SlashCommandOptionsOnlyBuilder
    | SlashCommandSubcommandsOnlyBuilder;
  /** Reject the command outside of servers. */
  guildOnly?: boolean;
  /** Per-user cooldown. */
  cooldownSeconds?: number;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
}

export type ComponentInteraction =
  | ButtonInteraction
  | AnySelectMenuInteraction
  | ModalSubmitInteraction;

/**
 * Handles buttons, select menus and modals whose customId starts with `${prefix}:`.
 * The remaining `:`-separated parts are passed as `args`.
 */
export interface ComponentHandler {
  prefix: string;
  execute(interaction: ComponentInteraction, args: string[]): Promise<void>;
}
