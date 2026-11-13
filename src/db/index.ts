import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { config } from "../config.js";
import * as schema from "./schema.js";

const databaseFile = resolve(config.databasePath);
mkdirSync(dirname(databaseFile), { recursive: true });

const sqlite = new Database(databaseFile);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");

export const db = drizzle(sqlite, { schema });
export { schema };

const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../drizzle",
);

export function runMigrations(): void {
  migrate(db, { migrationsFolder });
}

export function closeDatabase(): void {
  sqlite.close();
}
