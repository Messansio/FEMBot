# DiscordBotNew

A modular Discord bot built with TypeScript, Node.js, and discord.js. It currently
provides a single `/ping` slash command.

## Requirements

- Node.js 22.12 or newer
- A Discord application and bot created in the [Discord Developer Portal](https://discord.com/developers/applications)

## Setup

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env` and set:
   - `DISCORD_TOKEN`: the bot token from the Developer Portal
   - `DISCORD_CLIENT_ID`: the application's **Application ID**
   - `DISCORD_GUILD_ID` (optional): your server ID, for instant command updates

   Keep `.env` private and never commit your bot token.

3. Invite the bot to your server with the `bot` and `applications.commands`
   OAuth2 scopes. The bot only needs the `Guilds` gateway intent for `/ping`.

## Start the bot (development)

For immediate testing, set `DISCORD_GUILD_ID` in `.env`. Enable Developer Mode
in Discord under **User Settings > Advanced**, then right-click your server and
choose **Copy Server ID**.

From the project folder, register the slash command:

```sh
npm run deploy:commands
```

When `DISCORD_GUILD_ID` is set, commands are registered to that server and
should appear right away. Without it, commands are registered globally, and
Discord may take some time to show them. Then start the bot:

```sh
npm run dev
```

Leave this terminal running while you use the bot. For later starts, run
`npm run dev`; redeploy commands only when their definitions change.

## Start the bot (production)

```sh
npm run typecheck
npm run build
npm start
```

Run `npm run deploy:commands` whenever slash-command definitions change. Add
new commands under `src/commands/` and register them in `src/commands/index.ts`.
