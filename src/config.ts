import "dotenv/config";
import { UserError } from "./errors.js";

function getRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getOptionalEnvironmentVariable(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

export const config = {
  discordToken: getRequiredEnvironmentVariable("DISCORD_TOKEN"),
  discordClientId: getRequiredEnvironmentVariable("DISCORD_CLIENT_ID"),
  discordGuildId: getOptionalEnvironmentVariable("DISCORD_GUILD_ID"),
  databasePath: getOptionalEnvironmentVariable("DATABASE_PATH") ?? "data/fembot.db",
};

const GITHUB_VARIABLES = [
  "DISCORD_CLIENT_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "GITHUB_APP_SLUG",
  "PUBLIC_URL",
  "TOKEN_ENCRYPTION_KEY",
] as const;

export interface GitHubSetup {
  discordClientSecret: string;
  githubClientId: string;
  githubClientSecret: string;
  githubAppSlug: string;
  publicUrl: string;
  webPort: number;
  tokenEncryptionKey: Buffer;
}

let githubSetup: GitHubSetup | undefined;

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new UserError(`WEB_PORT must be a port number (1-65535), got "${value}".`);
  }
  return port;
}

/** Settings for the GitHub project commands; throws a readable error until docs/github-setup.md is done. */
export function getGitHubSetup(): GitHubSetup {
  if (githubSetup) return githubSetup;

  const missing = GITHUB_VARIABLES.filter((name) => !getOptionalEnvironmentVariable(name));
  if (missing.length) {
    throw new UserError(
      `GitHub features are not set up. Missing: ${missing.join(", ")}. See docs/github-setup.md.`,
    );
  }

  const tokenEncryptionKey = Buffer.from(getRequiredEnvironmentVariable("TOKEN_ENCRYPTION_KEY"), "base64");
  if (tokenEncryptionKey.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be 32 random bytes, base64 encoded.");
  }

  githubSetup = {
    discordClientSecret: getRequiredEnvironmentVariable("DISCORD_CLIENT_SECRET"),
    githubClientId: getRequiredEnvironmentVariable("GITHUB_CLIENT_ID"),
    githubClientSecret: getRequiredEnvironmentVariable("GITHUB_CLIENT_SECRET"),
    githubAppSlug: getRequiredEnvironmentVariable("GITHUB_APP_SLUG"),
    publicUrl: getRequiredEnvironmentVariable("PUBLIC_URL").replace(/\/+$/, ""),
    webPort: parsePort(getOptionalEnvironmentVariable("WEB_PORT") ?? "3000"),
    tokenEncryptionKey,
  };
  return githubSetup;
}

export function isGitHubConfigured(): boolean {
  return GITHUB_VARIABLES.every((name) => getOptionalEnvironmentVariable(name));
}
