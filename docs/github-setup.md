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
a small web server. **You choose its port with `WEB_PORT` in `.env`** (default
`3000`). `PUBLIC_URL` is the address people's browsers use to reach that port. If
`PUBLIC_URL` is a localhost address on a different port, the bot warns you at
startup.

| Situation | `PUBLIC_URL` |
|---|---|
| Only you, testing on this computer | `http://localhost:<WEB_PORT>`, e.g. `http://localhost:3000` |
| Friends must be able to join | An HTTPS address that reaches port 3000 on the bot's machine |

For friends, the quickest option is a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/):

```sh
cloudflared tunnel --url http://localhost:3000   # use your WEB_PORT
```

It prints an `https://….trycloudflare.com` address. That address changes every
time you restart the tunnel, and you'd have to update it in the GitHub App and in
Discord each time. For a permanent setup, use a named tunnel or a server with its
own domain.

## 2. Create the GitHub App

Follow the step-by-step tutorial: **[docs/github-app.md](github-app.md)**. It covers
every field on GitHub's form, the read-only permissions, installing the app on
private repositories, and how to check it works. You'll come back with
`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` and `GITHUB_APP_SLUG`.

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
     *View Channels, Manage Channels, Manage Roles, Manage Messages, Move Members,
     Create Instant Invite, Send Messages, Embed Links, Attach Files, Add Reactions,
     Read Message History, Connect*.
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
| Add Reactions, Manage Messages | The ⬆️/⬇️ scroll buttons on `/git tree` (Manage Messages removes your click right away) |

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
   `/git tree from:2025-01-01 to:2025-03-31`, `/git commit hash:<sha>` and `/git pr`.
   Click ⬆️/⬇️ under a tree to scroll it.
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
