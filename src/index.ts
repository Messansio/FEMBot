import type { FastifyInstance } from "fastify";
import { startApi } from "./api/server.js";
import { client } from "./bot/client.js";
import { registerEvents } from "./bot/events/index.js";
import { config } from "./config.js";
import { closeDatabase, runMigrations } from "./db/index.js";

runMigrations();
registerEvents(client);

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

let api: FastifyInstance | null = null;

async function shutdown(signal: string): Promise<void> {
  console.info(`Received ${signal}, shutting down...`);
  await api?.close();
  await client.destroy();
  closeDatabase();
  process.exit(0);
}
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await client.login(config.discordToken);
  api = await startApi();
} catch (error) {
  console.error("Startup failed:", error);
  process.exitCode = 1;
  await client.destroy();
  closeDatabase();
}
