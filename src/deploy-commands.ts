import { REST, Routes } from "discord.js";
import { commands } from "./commands/index.js";
import { config } from "./config.js";

const rest = new REST({ version: "10" }).setToken(config.discordToken);
const commandRoute = config.discordGuildId
  ? Routes.applicationGuildCommands(
      config.discordClientId,
      config.discordGuildId,
    )
  : Routes.applicationCommands(config.discordClientId);
const registrationScope = config.discordGuildId
  ? `guild ${config.discordGuildId}`
  : "globally";

try {
  await rest.put(commandRoute, {
    body: commands.map((command) => command.data.toJSON()),
  });

  console.info(
    `Registered ${commands.length} slash command(s) ${registrationScope}.`,
  );
} catch (error) {
  console.error("Failed to register slash commands:", error);
  process.exitCode = 1;
}
