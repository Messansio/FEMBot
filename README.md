# DiscordBotNew

A modular Discord bot built with TypeScript, Node.js, and discord.js. It currently
provides a single `/ping` slash command.

## Requirements

- Node.js 22.12 or newer
- A Discord application and bot created in the [Discord Developer Portal](https://discord.com/developers/applications)
- [uv](https://docs.astral.sh/uv/), for the `/code-review` command

## `/code-review`

Attach a code file, or run the command with no file to paste code into a form.
The bot replies with an image of the code in a Vercel-style dark theme, with the
lines that contain errors highlighted in red.

The review runs locally on the CPU with Liquid AI's
[d1-2B](https://huggingface.co/LiquidAI/d1-2B) decision model, from the Python
project in `review/`. The model detects the language when the file has no
extension, and rates every line for errors in the context of the whole file.
For TypeScript and JavaScript the project's own `tsc` also type-checks the code,
and for Python the code is compiled to find syntax errors. These exact errors are
added to the model's flags, and the reply shows each compiler message by its line.
On first use, `uv` installs the Python dependencies and the model downloads from
Hugging Face. That first review takes a while; later ones take a few seconds.
The model needs about 8 GB of RAM.

The model can miss bugs or flag correct lines. Tune it with `REVIEW_THRESHOLD`
(default `0.8`, higher means fewer lines flagged) or pick another d1 model with
`REVIEW_MODEL`. Before changing the prompt, threshold or model, measure the
change on the sample cases with `uv run python eval.py [model-id]` in `review/`.
The model mostly catches syntax, naming and type mistakes; it often misses
logic bugs such as a wrong loop bound or comparison.

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
