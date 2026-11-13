import {
  InteractionContextType,
  MessageFlags,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type SlashCommandStringOption,
} from "discord.js";
import type { Command } from "../types/command.js";

interface GuildCommandDefinition {
  data: Command["data"];
  cooldownSeconds?: number;
  execute(interaction: ChatInputCommandInteraction<"cached">): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
}

/** Defines a command that only works inside servers and receives a cached-guild interaction. */
export function defineGuildCommand(definition: GuildCommandDefinition): Command {
  definition.data.setContexts(InteractionContextType.Guild);
  const { execute, ...rest } = definition;
  return {
    ...rest,
    guildOnly: true,
    async execute(interaction) {
      if (!interaction.inCachedGuild()) {
        await interaction.reply({
          content: "This command can only be used in a server.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await execute(interaction);
    },
  };
}

export const reasonOption = (option: SlashCommandStringOption): SlashCommandStringOption =>
  option.setName("reason").setDescription("Reason (shown in the mod log)").setMaxLength(512);
