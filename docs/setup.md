# Setup from zero: your own bot, every `.env` key

This guide starts with nothing and ends with your own copy of the bot running: your
own Discord bot, your own GitHub App, and a `.env` you filled in yourself. It takes
30–45 minutes.

> **Using a `.env` someone else gave you?** Replace every value in it. Their
> `DISCORD_TOKEN` logs in as *their* bot, and their secrets belong to *their* apps.
> Start from `.env.example` instead.

## What you'll end up with

| `.env` key | What it is | Step |
|---|---|---|
| `DISCORD_TOKEN` | Your bot's password for logging in to Discord | [1.3](#13-create-the-bot-user-and-get-discord_token) |
| `DISCORD_CLIENT_ID` | Your application's ID | [1.2](#12-copy-discord_client_id) |
| `DISCORD_CLIENT_SECRET` | Lets the bot confirm who clicks a login or invite link | [1.4](#14-get-discord_client_secret-and-add-the-redirect) |
| `DISCORD_GUILD_ID` | Your test server, so commands appear instantly (optional) | [2](#2-make-a-test-server-and-get-discord_guild_id) |
| `WEB_PORT`, `PUBLIC_URL` | Where the bot's sign-in web page runs | [4](#4-choose-web_port-and-public_url) |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_APP_SLUG` | Your GitHub App | [5](#5-create-the-github-app) |
| `TOKEN_ENCRYPTION_KEY` | Encrypts stored GitHub logins | [6](#6-generate-token_encryption_key) |
| `DATABASE_PATH` | Where the bot keeps its data (optional) | [7](#7-fill-in-env) |
| `REVIEW_MODEL`, `REVIEW_THRESHOLD` | `/code-review` tuning (optional) | [7](#7-fill-in-env) |

You need:
- a Discord account and a GitHub account;
- [Node.js](https://nodejs.org) 22.13 or newer (`node --version`);
- [uv](https://docs.astral.sh/uv/getting-started/installation/) (`uv --version`);
- this repository on your computer.

Keep a text editor open with a copy of `.env.example` saved as `.env` in the project
folder, and paste each value into it as you go:

```sh
cp .env.example .env
```

---

## 1. Create the Discord application and bot

### 1.1 Create the application

1. Open the [Discord Developer Portal](https://discord.com/developers/applications)
   and log in.
2. Click **New Application** (top right).
3. Type a name (e.g. `FEMBot`), accept the Developer Terms, and click **Create**.

The name and icon are what people see. You can change them later in
**General Information**.

### 1.2 Copy `DISCORD_CLIENT_ID`

On **General Information**, copy **Application ID** (a long number):

```ini
DISCORD_CLIENT_ID=123456789012345678
```

### 1.3 Create the bot user and get `DISCORD_TOKEN`

1. Click **Bot** in the left sidebar.
2. Click **Reset Token**, confirm, and enter your 2FA code if asked.
3. Click **Copy**. Discord shows the token **only once**.

   ```ini
   DISCORD_TOKEN=MTIz...long-token...
   ```

4. On the same page:
   - **Public Bot**:
     - turn it **off** if only you will add the bot to servers;
     - leave it **on** if friends should be able to add it to their account (step
       1.5).
   - **Privileged Gateway Intents**: leave all three **off**. The bot doesn't need
     them.
   - Click **Save Changes** if you changed anything.

The token is the bot's password: anyone who has it can control your bot. Never share
it, never commit it, and if it leaks, click **Reset Token** again.

### 1.4 Get `DISCORD_CLIENT_SECRET` and add the redirect

1. Click **OAuth2** in the left sidebar.
2. Under **Client information**, click **Reset Secret** next to **Client Secret**,
   confirm, then **Copy**. This one is also shown only once.

   ```ini
   DISCORD_CLIENT_SECRET=AbCdEf...
   ```

3. Scroll to **Redirects**, click **Add Redirect**, and enter your `PUBLIC_URL` +
   `/oauth/discord/callback`. For testing on your own computer that's:

   ```text
   http://localhost:3000/oauth/discord/callback
   ```

   If you choose a different port or a public address in step 4, come back and
   change this.
4. Click **Save Changes**.

The client secret is **not** the bot token. The secret goes in
`DISCORD_CLIENT_SECRET`; the token from step 1.3 goes in `DISCORD_TOKEN`.

### 1.5 Installation settings

Click **Installation** in the left sidebar.

1. **Installation Contexts**: check both boxes.
   - **Guild Install**: add the bot to servers.
   - **User Install**: add it to your own account, so you can use `/project invite`
     and `/git` in DMs (for example to invite a friend from your chat with them).
2. **Install Link**: choose **Discord Provided Link**.
3. **Default Install Settings**:
   - **User Install** scopes: `applications.commands`.
   - **Guild Install** scopes: `applications.commands` and `bot`.
   - **Guild Install** permissions (appears once `bot` is selected). Select:

     | Permission | Why |
     |---|---|
     | View Channels | See the channels it manages |
     | Send Messages, Embed Links, Attach Files, Read Message History | Reply with cards and images |
     | Add Reactions, Manage Messages | ⬆️/⬇️ scrolling on `/git tree` (Manage Messages removes your click) |
     | Manage Channels | Create and delete project channels |
     | Manage Roles | Per-person access, mutes and bans in project channels |
     | Move Members, Connect | Disconnect banned or muted people from project voice channels |
     | Create Instant Invite | Add an invited friend to the server when they click the invite |

4. Click **Save Changes**.

## 2. Make a test server and get `DISCORD_GUILD_ID`

Optional, but recommended: with a server ID, new commands appear instantly instead of
after up to an hour.

1. In Discord, click **+** (*Add a Server*) at the bottom of the server list, then
   **Create My Own → For me and my friends**, name it, and click **Create**. You can
   also use a server where you're the owner or an admin.
2. Turn on Developer Mode: **User Settings** (⚙ next to your name) → **Advanced** →
   **Developer Mode** on.
3. Right-click the server's icon → **Copy Server ID**.

   ```ini
   DISCORD_GUILD_ID=987654321098765432
   ```

## 3. Add the bot to your server (and to your account)

1. In the Developer Portal → **Installation**, copy the **Install Link** and open it
   in your browser.
2. Choose **Add to Server**, pick your test server, click **Continue**, keep all
   permissions checked, and click **Authorize**. The bot appears in the server's
   member list (offline until you start it).
3. Open the same link again and choose **Add to My Apps**. That's the User Install
   from step 1.5, for using the bot in DMs.
4. Give the bot room to manage permissions: **Server Settings → Roles**, then drag
   the bot's role (same name as the bot) above the roles of the people it will
   manage. A bot can only manage people whose roles are below its own.

## 4. Choose `WEB_PORT` and `PUBLIC_URL`

When someone logs in to GitHub or opens an invite, their browser comes back to a
small web page the bot runs.

- **`WEB_PORT`** is the port that web page runs on.
- **`PUBLIC_URL`** is the address browsers use to reach it.

**Just you, testing on this computer:**

```ini
WEB_PORT=3000
PUBLIC_URL=http://localhost:3000
```

**Friends must be able to join (invites):** `PUBLIC_URL` must be a public HTTPS
address that reaches `WEB_PORT` on the bot's computer. The quickest way is a
[Cloudflare quick tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/):

```sh
cloudflared tunnel --url http://localhost:3000
```

It prints an address like `https://random-words.trycloudflare.com`:

```ini
WEB_PORT=3000
PUBLIC_URL=https://random-words.trycloudflare.com
```

Quick-tunnel addresses change on every restart, and each change means updating the
redirect (step 1.4) and the GitHub callback (step 5). For a permanent address, use a
named Cloudflare tunnel or a server with its own domain.

If you change `WEB_PORT`, change it in `PUBLIC_URL` too (for localhost), in the
Discord redirect and in the GitHub callback. The bot warns at startup when a
localhost `PUBLIC_URL` doesn't match `WEB_PORT`.

## 5. Create the GitHub App

Follow **[docs/github-app.md](github-app.md)**: it goes through GitHub's form field
by field. The short version:

1. Go to <https://github.com/settings/apps/new>.
2. Fill in:
   - **Name**: unique, e.g. `FEMBot-yourname`.
   - **Homepage URL**: any URL, e.g. your repo.
   - **Callback URL**: `PUBLIC_URL/oauth/github/callback`, e.g.
     `http://localhost:3000/oauth/github/callback`.
   - **Expire user authorization tokens**: checked.
   - **Webhook → Active**: unchecked.
   - **Repository permissions**: **Contents**, **Metadata** and **Pull requests**
     set to **Read-only**. Everything else stays at *No access*.
3. Click **Create GitHub App**.
4. Copy the values:

   ```ini
   GITHUB_CLIENT_ID=Iv23li...          # "Client ID" on the app page (not the numeric App ID)
   GITHUB_CLIENT_SECRET=...            # "Generate a new client secret", shown once
   GITHUB_APP_SLUG=fembot-yourname     # from the public link github.com/apps/<slug>
   ```

5. Click **Install App** and install it on your repositories. That's needed for
   private repos; public ones work without it.

## 6. Generate `TOKEN_ENCRYPTION_KEY`

This key encrypts the GitHub logins the bot stores. Generate it once, in the project
folder:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

```ini
TOKEN_ENCRYPTION_KEY=k3J9...44 characters...=
```

Never change it afterwards (everyone would have to log in again), and never share
it.

## 7. Fill in `.env`

Your finished `.env` looks like this, with your own values:

```ini
# Discord (step 1–2)
DISCORD_TOKEN=MTIz...
DISCORD_CLIENT_ID=123456789012345678
DISCORD_GUILD_ID=987654321098765432
DISCORD_CLIENT_SECRET=AbCdEf...

# Sign-in web page (step 4)
WEB_PORT=3000
PUBLIC_URL=http://localhost:3000

# GitHub App (step 5)
GITHUB_CLIENT_ID=Iv23li...
GITHUB_CLIENT_SECRET=...
GITHUB_APP_SLUG=fembot-yourname

# Encryption (step 6)
TOKEN_ENCRYPTION_KEY=k3J9...=

# Optional
DATABASE_PATH=data/fembot.db
REVIEW_MODEL=LiquidAI/d1-2B
REVIEW_THRESHOLD=0.8
```

- **Required**: `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`.
- **The GitHub commands** (`/github`, `/project`, `/git`) turn on once *all* of these
  are set: `DISCORD_CLIENT_SECRET`, `PUBLIC_URL`, the three `GITHUB_*` values and
  `TOKEN_ENCRYPTION_KEY`.
- **Everything else** has defaults.

`.env` is already in `.gitignore`. Never commit it or send it to anyone, the same as
the `data/` folder.

## 8. Install and start

From the project folder:

```sh
npm install
```

For the `/git` images and `/code-review`:

```sh
cd review
uv sync
cd ..
```

Only for `/code-review` (downloads the model, a few GB):

```sh
cd review
uv run hf download LiquidAI/d1-2B
cd ..
```

Register the slash commands with Discord. Run this again whenever commands change:

```sh
npm run deploy:commands
```

It should say `Registered 10 slash command(s) guild …`. Then start the bot:

```sh
npm run dev
```

Expected output:

```text
Logged in as FEMBot#1234
OAuth server listening on :3000 (http://localhost:3000)
```

If the second line says *GitHub features are off*, one of the GitHub values in `.env`
is missing; the bot names it when you run `/github login`. Keep this terminal open
while you use the bot.

## 9. Try everything

In your test server:

1. `/ping` checks the bot answers.
2. `/github login`: click the button, approve Discord, then GitHub. The page says
   **Logged in as @you**.
3. `/project create`: search for a repository you own. A private category with
   `general`, `commits`, `pull-requests` and two voice channels appears.
4. In a project channel:
   - `/git tree` (click ⬆️/⬇️ to scroll);
   - `/git tree format:text from:2025-01-01`;
   - `/git commit hash:<sha>`;
   - `/git pr`.
5. `/project invite`, then open the link in a private browser window logged in to
   another Discord account to see what a friend sees.
6. `/project mute user:@someone duration:10m`, then `/project unmute`.
7. `/project delete`: type the repo name. Only the Discord channels are removed.

## Troubleshooting

| Problem | Fix |
|---|---|
| `Missing required environment variable: DISCORD_TOKEN` | `.env` isn't in the project folder, or the line is empty. |
| `An invalid token was provided` | Copy the token again from **Bot → Reset Token** (step 1.3). |
| Commands don't appear | Run `npm run deploy:commands`. Set `DISCORD_GUILD_ID` for instant updates. Restart Discord (Ctrl/Cmd+R). |
| Commands missing in DMs | User Install on (step 1.5), then **Add to My Apps** (step 3.3). |
| *Invalid OAuth2 redirect_uri* (Discord) | The redirect in step 1.4 must be exactly `PUBLIC_URL/oauth/discord/callback`. |
| *redirect_uri is not associated with this application* (GitHub) | The GitHub App's callback must be exactly `PUBLIC_URL/oauth/github/callback`. |
| The sign-in page doesn't load | The bot isn't running, or `PUBLIC_URL` doesn't reach `WEB_PORT` (step 4). |
| *Missing Permissions* when creating channels | Re-add the bot with the permissions in step 1.5, and move its role up (step 3.4). |
| `/project create` *can't see* a private repo | Install the GitHub App on it (step 5.5). |
| A friend gets *No access to the repository* | Add them on GitHub (*repo → Settings → Collaborators*), then they open the invite again. |
| ⬆️/⬇️ stay after clicking | The bot lacks **Manage Messages** in that channel. |

More on the GitHub App: [docs/github-app.md](github-app.md).

## How the bot keeps your accounts safe

- **No passwords.** Sign-in happens on Discord's and GitHub's own pages; the bot only
  receives tokens.
- **Read-only GitHub access.** The app's permissions are read-only, so the bot can't
  change repositories.
- **Encrypted at rest.** GitHub tokens are stored with AES-256-GCM using
  `TOKEN_ENCRYPTION_KEY`. Login and invite links are stored only as SHA-256 hashes.
- **Every browser flow first proves who you are with Discord,** so a forwarded link
  can't connect someone else's GitHub account to yours.
- **Logging out:** `/github logout` revokes the bot's GitHub access and deletes the
  tokens; <https://github.com/settings/apps/authorizations> does the same from
  GitHub.
