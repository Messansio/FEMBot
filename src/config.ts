import "dotenv/config";

function getRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export const config = {
  discordToken: getRequiredEnvironmentVariable("DISCORD_TOKEN"),
  discordClientId: getRequiredEnvironmentVariable("DISCORD_CLIENT_ID"),
  discordGuildId: process.env["DISCORD_GUILD_ID"]?.trim() || undefined,
};
