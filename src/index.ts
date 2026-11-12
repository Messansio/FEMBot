import {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  MessageFlags,
} from "discord.js";
import type { Interaction } from "discord.js";
import { config } from "./config.js";
import { commands } from "./commands/index.js";
import type { Command } from "./types/command.js";

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const commandHandlers = new Collection<string, Command>();
for (const command of commands) {
  commandHandlers.set(command.data.name, command);
}

async function handleInteraction(interaction: Interaction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  const command = commandHandlers.get(interaction.commandName);
  if (!command) {
    await interaction.reply({
      content: "Unknown command.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Failed to execute /${interaction.commandName}:`, error);

    const response = {
      content: "There was an error while executing this command.",
      flags: MessageFlags.Ephemeral as const,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(response);
    } else {
      await interaction.reply(response);
    }
  }
}

client.once(Events.ClientReady, (readyClient) => {
  console.info(`Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, (interaction) => {
  void handleInteraction(interaction).catch((error: unknown) => {
    console.error("Failed to handle Discord interaction:", error);
  });
});

client.login(config.discordToken).catch((error: unknown) => {
  console.error("Failed to log in to Discord:", error);
  process.exitCode = 1;
});
