import {
  ChannelType,
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  MessageFlags,
} from "discord.js";
import type { Interaction } from "discord.js";
import { config, isGitHubConfigured } from "./config.js";
import { commands } from "./commands/index.js";
import { run } from "./db.js";
import { UserError } from "./errors.js";
import { restoreMutes } from "./projects.js";
import { card, symbols } from "./theme.js";
import type { Command } from "./types/command.js";
import { startWebServer } from "./web.js";

const client = new Client({
  // GuildVoiceStates: to disconnect banned/muted people from project voice channels.
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const commandHandlers = new Collection<string, Command>();
for (const command of commands) {
  commandHandlers.set(command.data.name, command);
}

async function handleInteraction(interaction: Interaction): Promise<void> {
  if (interaction.isAutocomplete()) {
    await commandHandlers
      .get(interaction.commandName)
      ?.autocomplete?.(interaction)
      .catch(async (error: unknown) => {
        console.error(`Autocomplete failed for /${interaction.commandName}:`, error);
        if (!interaction.responded) await interaction.respond([]);
      });
    return;
  }
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
    const isUserError = error instanceof UserError;
    if (!isUserError) console.error(`Failed to execute /${interaction.commandName}:`, error);

    const embed = card(
      `${symbols.fail} ${isUserError ? "Can't do that" : "Something went wrong"}`,
      isUserError ? error.message : "There was an error while executing this command.",
      "error",
    );
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply({ embeds: [embed], content: "", files: [], components: [] });
    } else if (interaction.replied) {
      await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  }
}

client.once(Events.ClientReady, (readyClient) => {
  console.info(`Logged in as ${readyClient.user.tag}`);
  restoreMutes(readyClient);
  if (isGitHubConfigured()) startWebServer(readyClient);
  else console.info("GitHub features are off: see docs/github-setup.md to turn them on.");
});

client.on(Events.InteractionCreate, (interaction) => {
  void handleInteraction(interaction).catch((error: unknown) => {
    console.error("Failed to handle Discord interaction:", error);
  });
});

// A project category deleted by hand ends the project too.
client.on(Events.ChannelDelete, (channel) => {
  if (channel.type === ChannelType.GuildCategory) run("DELETE FROM projects WHERE category_id = ?", channel.id);
});

client.login(config.discordToken).catch((error: unknown) => {
  console.error("Failed to log in to Discord:", error);
  process.exitCode = 1;
});
