# Setting up GitHub login and project channels

This turns on `/github`, `/project` and `/git`. It takes about 15 minutes:

1. Pick the bot's public URL
2. Create a GitHub App (read-only)
3. Configure the Discord application
4. Fill in `.env` and start the bot

## How it works, and why it's safe

- **You never give the bot a password.** `/github login` sends you to GitHub's own
  sign-in page. GitHub gives the bot a token instead.
- **The token is read-only.** The GitHub App only asks for read access, so the bot
  can't push, delete, comment or change anything, even by mistake. Tokens expire
  after 8 hours and renew themselves for up to 6 months.
- **Tokens are encrypted at rest** (AES-256-GCM, key in `TOKEN_ENCRYPTION_KEY`).
  Tokens can't be hashed, because the bot has to use them; everything that only
  needs checking (invite links, login links) is stored as a SHA-256 hash only.
- **Every browser step first proves who you are with Discord.** A login or invite
  link that gets forwarded can't connect someone else's GitHub to your Discord.
- `/github logout` revokes the bot's access on GitHub and deletes the tokens. You
  can also revoke it any time at <https://github.com/settings/apps/authorizations>.

## 1. Pick the bot's public URL

GitHub and Discord send people back to the bot after they sign in, so the bot runs
a small web server (port `WEB_PORT`, default `3000`). `PUBLIC_URL` is the address
people's browsers use to reach it.

| Situation | `PUBLIC_URL` |
|---|---|
| Only you, testing on this computer | `http://localhost:3000` |
| Friends must be able to join | An HTTPS address that reaches port 3000 on the bot's machine |

For friends, the quickest option is a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/):

```sh
cloudflared tunnel --url http://localhost:3000
```

It prints an `https://….trycloudflare.com` address. That address changes every
time you restart the tunnel, and you'd have to update it in the GitHub App and in
Discord each time. For a permanent setup, use a named tunnel or a server with its
own domain.

## 2. Create the GitHub App

1. Open <https://github.com/settings/apps/new> (for an organization:
   *Organization settings → Developer settings → GitHub Apps → New GitHub App*).
2. Fill in:
   - **GitHub App name**: anything unique, e.g. `FEMBot-yourname`.
   - **Homepage URL**: your repository's URL, or `PUBLIC_URL`.
   - **Callback URL**: `PUBLIC_URL/oauth/github/callback`, for example
     `http://localhost:3000/oauth/github/callback`.
   - **Expire user authorization tokens**: leave this **checked**.
   - **Request user authorization (OAuth) during installation**: leave unchecked.
   - **Webhook → Active**: **uncheck** it. The bot doesn't use webhooks.
3. **Permissions → Repository permissions**. Set only these three; leave every
   other permission at *No access*:
   - **Contents**: Read-only (commits and diffs)
   - **Metadata**: Read-only (required)
   - **Pull requests**: Read-only
4. **Where can this GitHub App be installed?**
   - *Any account* if other people will create projects for their own repos.
   - *Only on this account* if only you will.
5. Click **Create GitHub App**.
6. On the app's page:
   - Copy the **Client ID** into `GITHUB_CLIENT_ID`.
   - Click **Generate a new client secret** and copy it into
     `GITHUB_CLIENT_SECRET`. GitHub shows it only once.
   - Copy the slug from the app's public link, `https://github.com/apps/<slug>`,
     into `GITHUB_APP_SLUG`.
   - You don't need a private key: the bot never acts as the app itself.
7. **Install the app on your repositories**: on the app's page, click
   *Install App*, choose your account, then pick *All repositories* or the ones
   you want.
   - Public repositories work without installing.
   - **Private repositories need it.** GitHub only lets the bot see private repos
     where the app is installed. People you invite also need their own access to
     the repo on GitHub.

## 3. Configure the Discord application

In the [Discord Developer Portal](https://discord.com/developers/applications),
open your bot's application:

1. **OAuth2 → Client information**: click *Reset Secret* and copy it into
   `DISCORD_CLIENT_SECRET`.
2. **OAuth2 → Redirects**: add `PUBLIC_URL/oauth/discord/callback`, for example
   `http://localhost:3000/oauth/discord/callback`, then save.
3. **Installation → Installation Contexts**: check both **Guild Install** and
   **User Install**. User Install lets people use `/project invite` and `/git` in
   DMs, for example to invite a friend from your private chat with them.
4. **Installation → Default Install Settings**:
   - Guild Install scopes: `bot` and `applications.commands`. Permissions:
     *View Channels, Manage Channels, Manage Roles, Move Members, Create Instant
     Invite, Send Messages, Embed Links, Attach Files, Read Message History,
     Connect*.
   - User Install scope: `applications.commands`.
5. Use the **Install Link** to add the bot to your server again, so it gets the new
   permissions.
6. In your server's role settings, the bot needs every permission it hands out to
   members (view, send, connect, speak and so on). The simplest way is to keep the
   bot's role near the top with the permissions above.

Why these permissions:

| Permission | Used for |
|---|---|
| Manage Channels | Creating and deleting the project category and its channels |
| Manage Roles | Per-person access, mutes and bans on the project channels |
| Move Members | Disconnecting banned or muted people from project voice channels |
| Create Instant Invite | Adding an invited person to the server when they click the link |

## 4. Fill in `.env` and start the bot

Generate the encryption key once and keep it secret:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Add these to `.env` (see `.env.example`):

```ini
DISCORD_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_APP_SLUG=...
PUBLIC_URL=http://localhost:3000
TOKEN_ENCRYPTION_KEY=...
# optional
WEB_PORT=3000
DATABASE_PATH=data/fembot.db
```

Never change `TOKEN_ENCRYPTION_KEY` afterwards: the stored tokens can no longer be
decrypted and everyone has to log in again. Never commit `.env` or `data/`.

Register the commands and start the bot:

```sh
npm run deploy:commands
npm run dev
```

The console should show `OAuth server listening on :3000`. If it says
*GitHub features are off*, a variable in `.env` is missing.

## 5. Try it

1. Run `/github login` and click the button. Approve Discord, then GitHub. The page
   says *Logged in as @you*.
2. In your server, run `/project create` and pick a repository you own. A private
   category named after the repo appears, with `general`, `commits`,
   `pull-requests` and two voice channels. Only you can see it so far.
3. Run `/project invite` (in the server, or in a DM with a friend) and send the
   link. When your friend clicks it, the bot:
   - asks Discord who they are;
   - signs them in to GitHub if needed;
   - checks that their GitHub account can see the repository;
   - adds them to the server if they aren't in it yet;
   - opens the project channel.
4. Inside a project channel, try `/git tree`, `/git tree format:text`,
   `/git commit hash:<sha>` and `/git pr`.
5. Moderation: `/project mute user:@x duration:30m`, `/project unmute`,
   `/project ban`, `/project unban`.
6. `/project delete` asks you to type the repo name, then deletes only the
   Discord channels. The GitHub repository is never touched.

## Troubleshooting

| Problem | Fix |
|---|---|
| GitHub says *redirect_uri is not associated* | The app's Callback URL must be exactly `PUBLIC_URL/oauth/github/callback`. |
| Discord says *Invalid OAuth2 redirect_uri* | Add `PUBLIC_URL/oauth/discord/callback` under OAuth2 → Redirects. |
| *can't see owner/repo* when creating a private repo's project | Install the GitHub App on that repository (step 2.7). |
| An invited friend gets *No access to the repository* | Add them as a collaborator on GitHub (or to the team), then they click the invite again. |
| *Missing Permissions* when creating channels | Re-invite the bot with the permissions in step 3.4, and move its role up. |
| Commands don't show up in DMs | Turn on User Install (step 3.3), then authorize the app for your account from its install link. |
