import {
  Collection,
  MessageFlags,
  type ChatInputCommandInteraction,
  type Interaction,
} from "discord.js";
import { commands } from "../commands/index.js";
import { components } from "../components/index.js";
import type { Command, ComponentHandler, ComponentInteraction } from "../types/command.js";

const commandHandlers = new Collection<string, Command>(
  commands.map((command) => [command.data.name, command]),
);
const componentHandlers = new Collection<string, ComponentHandler>(
  components.map((handler) => [handler.prefix, handler]),
);

/** key: `${command}:${userId}` → timestamp when the cooldown ends */
const cooldowns = new Map<string, number>();

async function replyEphemeral(
  interaction: ChatInputCommandInteraction | ComponentInteraction,
  content: string,
): Promise<void> {
  const payload = { content, flags: MessageFlags.Ephemeral as const };
  if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
  else await interaction.reply(payload);
}

function checkCooldown(command: Command, userId: string): number {
  if (!command.cooldownSeconds) return 0;
  const key = `${command.data.name}:${userId}`;
  const now = Date.now();
  const endsAt = cooldowns.get(key) ?? 0;
  if (endsAt > now) return endsAt - now;
  cooldowns.set(key, now + command.cooldownSeconds * 1000);
  return 0;
}

// Keep the cooldown map from growing forever.
setInterval(() => {
  const now = Date.now();
  for (const [key, endsAt] of cooldowns) if (endsAt <= now) cooldowns.delete(key);
}, 60_000).unref();

async function handleChatInput(interaction: ChatInputCommandInteraction): Promise<void> {
  const command = commandHandlers.get(interaction.commandName);
  if (!command) {
    await replyEphemeral(interaction, "Unknown command.");
    return;
  }

  const remaining = checkCooldown(command, interaction.user.id);
  if (remaining > 0) {
    await replyEphemeral(
      interaction,
      `⏳ Slow down! You can use \`/${command.data.name}\` again in ${Math.ceil(remaining / 1000)}s.`,
    );
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Failed to execute /${interaction.commandName}:`, error);
    await replyEphemeral(interaction, "There was an error while executing this command.").catch(
      () => undefined,
    );
  }
}

async function handleComponent(interaction: ComponentInteraction): Promise<void> {
  const [prefix, ...args] = interaction.customId.split(":");
  const handler = prefix ? componentHandlers.get(prefix) : undefined;
  if (!handler) return; // e.g. collectors handle their own components

  try {
    await handler.execute(interaction, args);
  } catch (error) {
    console.error(`Failed to handle component ${interaction.customId}:`, error);
    await replyEphemeral(interaction, "Something went wrong.").catch(() => undefined);
  }
}

export async function handleInteraction(interaction: Interaction): Promise<void> {
  if (interaction.isChatInputCommand()) return handleChatInput(interaction);

  if (interaction.isAutocomplete()) {
    const command = commandHandlers.get(interaction.commandName);
    try {
      await command?.autocomplete?.(interaction);
    } catch (error) {
      console.error(`Autocomplete failed for /${interaction.commandName}:`, error);
      if (!interaction.responded) await interaction.respond([]).catch(() => undefined);
    }
    return;
  }

  if (interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) {
    return handleComponent(interaction);
  }
}
