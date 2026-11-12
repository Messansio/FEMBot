import { REST, Routes } from "discord.js";
import { config } from "./config.js";

const rest = new REST({ version: "10" }).setToken(config.discordToken);

const route = config.discordGuildId
  ? Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId)
  : Routes.applicationCommands(config.discordClientId);

const scopeLabel = config.discordGuildId
  ? `guild ${config.discordGuildId}`
  : "global";

try {
  const registeredCommands = (await rest.get(route)) as Array<{
    id: string;
    name: string;
  }>;

  for (const command of registeredCommands) {
    await rest.delete(`${route}/${command.id}`);
    console.info(`Deleted ${scopeLabel} command: ${command.name} (${command.id})`);
  }

  console.info(`Deleted ${registeredCommands.length} command(s) from ${scopeLabel}.`);
} catch (error) {
  console.error(`Failed to delete ${scopeLabel} commands:`, error);
  process.exitCode = 1;
}
