import "dotenv/config";
import { z } from "zod";

const optionalString = z
  .string()
  .trim()
  .transform((value) => value || undefined)
  .optional();

const environmentSchema = z.object({
  DISCORD_TOKEN: z.string().trim().min(1),
  DISCORD_CLIENT_ID: z.string().trim().min(1),
  DISCORD_GUILD_ID: optionalString,

  // Dashboard (optional: the API is disabled when the client secret is missing)
  DISCORD_CLIENT_SECRET: optionalString,
  SESSION_SECRET: optionalString,
  DASHBOARD_URL: z.string().trim().url().default("http://localhost:5173"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  DATABASE_PATH: z.string().trim().default("data/bot.db"),
  OWNER_IDS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const parsed = environmentSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const env = parsed.data;

if (env.DISCORD_CLIENT_SECRET && (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32)) {
  throw new Error(
    "SESSION_SECRET must be set to at least 32 characters when DISCORD_CLIENT_SECRET is set.",
  );
}

export const config = {
  discordToken: env.DISCORD_TOKEN,
  discordClientId: env.DISCORD_CLIENT_ID,
  discordGuildId: env.DISCORD_GUILD_ID,
  discordClientSecret: env.DISCORD_CLIENT_SECRET,
  sessionSecret: env.SESSION_SECRET,
  dashboardUrl: env.DASHBOARD_URL.replace(/\/$/, ""),
  apiPort: env.API_PORT,
  databasePath: env.DATABASE_PATH,
  ownerIds: env.OWNER_IDS,
  isProduction: env.NODE_ENV === "production",
} as const;
