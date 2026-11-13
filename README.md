# DiscordBotNew

A Discord bot for large communities, built with TypeScript and discord.js. It comes
with a web dashboard. It supports many servers, and each server has its own settings
stored in SQLite.

**Features**

- **Moderation**: ban (including temporary bans that expire on their own), unban, kick, timeout,
  warn, notes, numbered cases, user history, purge with filters, slowmode, lock/unlock,
  role and nickname management. Before acting, the bot checks role hierarchy, DMs the
  target, and posts to the mod log.
- **Logging**: moderation, message edits and deletes, member joins and leaves, and tickets.
  Bans done through Discord's own UI are recorded as cases too.
- **Community**: welcome and leave messages, autoroles, self-assign role panels
  (buttons or dropdown), support tickets in private threads with transcripts, and
  leveling with XP, rank, leaderboard and role rewards.
- **Dashboard**: log in with Discord and manage every server where you have
  *Manage Server*. You can edit settings, browse and edit cases, build role panels, view tickets
  and the leaderboard, and check an audit log of who changed what.

## Requirements

- Node.js 22.12 or newer
- A Discord application created in the [Developer Portal](https://discord.com/developers/applications)

## Setup

1. Install dependencies. This also installs the dashboard's dependencies in `web/`.

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env` and fill it in. The file explains each variable.

3. In the Developer Portal:
   - **Bot → Privileged Gateway Intents**: enable **Server Members Intent** and
     **Message Content Intent**.
   - **OAuth2 → Redirects** (for the dashboard): add `<DASHBOARD_URL>/auth/callback`,
     for example `http://localhost:5173/auth/callback`.

4. Invite the bot. Once you're logged in, the dashboard shows an **Add the bot** link
   with the right permissions. Keep the bot's role **above** any role it needs to
   assign or moderate.

5. Register slash commands. Run this again whenever command definitions change.

   ```sh
   npm run deploy:commands
   ```

   With `DISCORD_GUILD_ID` set, commands appear in that server right away. Without it
   they are registered globally, which can take a while to show up.

## Development

```sh
npm run dev
```

This starts the bot and the API on `API_PORT` (default 3000), plus the dashboard on
http://localhost:5173. Vite forwards `/api` and `/auth` to the bot. Use `npm run dev:bot`
to run only the bot.

The SQLite database is created at `DATABASE_PATH`, and migrations run on startup.

## Production

```sh
npm run typecheck
npm run build
NODE_ENV=production npm start
```

In production the bot process also serves the built dashboard (`web/dist`). Set
`DASHBOARD_URL` to the public HTTPS URL that points at `API_PORT`, usually behind a
reverse proxy, and update the OAuth2 redirect to match.

## Quick start in a server

| Goal | Command |
| --- | --- |
| Mod log channel | `/config logs type:moderation channel:#mod-log` |
| Moderator roles | `/config modrole role:@Mods` |
| Welcome message | `/welcome set type:welcome channel:#welcome` |
| Autoroles | `/autorole add role:@Member` |
| Role panel | `/roles-panel create`, then `add`, then `publish` |
| Tickets | `/ticket setup channel:#support staff_role:@Support` |
| Leveling | `/levels toggle enabled:true`, `/levels reward add` |
| Dashboard link | `/config dashboard` |

## Project structure

```
src/
  index.ts            startup: migrations, then Discord login, then dashboard API
  bot/                client, interaction router, event handlers
  commands/           slash commands by category (info, utility, moderation, community)
  components/         button, select menu and modal handlers (customId "prefix:args")
  services/           settings cache, cases, mod log, scheduler, leveling, tickets, role panels
  db/                 Drizzle schema and connection (migrations live in drizzle/)
  api/                Fastify server, Discord OAuth, guild guard, REST routes, shared types
web/                  React + Vite + Tailwind dashboard
```

### Adding a command

Create a file in `src/commands/<category>/`. Use `defineGuildCommand` from
`src/commands/helpers.ts` for server-only commands, add the command to
`src/commands/index.ts`, then run `npm run deploy:commands`.

### Changing the database

Edit `src/db/schema.ts`, run `npm run db:generate`, and commit the new file in
`drizzle/`. It is applied automatically the next time the bot starts.
