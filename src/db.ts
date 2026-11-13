import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

mkdirSync(dirname(config.databasePath), { recursive: true });

export const db = new DatabaseSync(config.databasePath);

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;

  -- Tokens are AES-GCM encrypted (security.ts); passwords never reach the bot.
  CREATE TABLE IF NOT EXISTS github_accounts (
    discord_user_id TEXT PRIMARY KEY,
    github_id INTEGER NOT NULL,
    login TEXT NOT NULL,
    avatar_url TEXT NOT NULL,
    access_token TEXT NOT NULL,
    access_expires_at INTEGER,
    refresh_token TEXT,
    refresh_expires_at INTEGER,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY,
    guild_id TEXT NOT NULL,
    category_id TEXT NOT NULL UNIQUE,
    owner_discord_id TEXT NOT NULL,
    github_repo_id INTEGER NOT NULL,
    repo_full_name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (guild_id, github_repo_id)
  );

  CREATE TABLE IF NOT EXISTS project_bans (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    discord_user_id TEXT NOT NULL,
    PRIMARY KEY (project_id, discord_user_id)
  );

  CREATE TABLE IF NOT EXISTS project_mutes (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    discord_user_id TEXT NOT NULL,
    until INTEGER NOT NULL,
    PRIMARY KEY (project_id, discord_user_id)
  );

  -- token_hash = sha256 of the link token; the token itself is never stored.
  CREATE TABLE IF NOT EXISTS invites (
    token_hash TEXT PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    invited_discord_id TEXT,
    created_by TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  -- Short-lived browser flows (login / invite), keyed by the hash of the OAuth state.
  CREATE TABLE IF NOT EXISTS web_flows (
    state_hash TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    discord_user_id TEXT,
    invite_hash TEXT,
    discord_access_token TEXT,
    verified INTEGER NOT NULL DEFAULT 0, -- 1 once Discord OAuth proved who is in the browser
    expires_at INTEGER NOT NULL
  );
`);

export interface GitHubAccountRow {
  discord_user_id: string;
  github_id: number;
  login: string;
  avatar_url: string;
  access_token: string;
  access_expires_at: number | null;
  refresh_token: string | null;
  refresh_expires_at: number | null;
}

export interface ProjectRow {
  id: number;
  guild_id: string;
  category_id: string;
  owner_discord_id: string;
  github_repo_id: number;
  repo_full_name: string;
}

export interface InviteRow {
  token_hash: string;
  project_id: number;
  invited_discord_id: string | null;
  created_by: string;
  expires_at: number;
}

export interface WebFlowRow {
  state_hash: string;
  kind: "login" | "invite";
  discord_user_id: string | null;
  invite_hash: string | null;
  discord_access_token: string | null;
  verified: number;
  expires_at: number;
}

type Param = string | number | null;

export function one<T>(sql: string, ...params: Param[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function all<T>(sql: string, ...params: Param[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function run(sql: string, ...params: Param[]): void {
  db.prepare(sql).run(...params);
}

export function deleteExpired(): void {
  const now = Date.now();
  run("DELETE FROM web_flows WHERE expires_at < ?", now);
  run("DELETE FROM invites WHERE expires_at < ?", now);
}
