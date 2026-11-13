# DiscordBotNew

A modular Discord bot built with TypeScript, Node.js, and discord.js. It turns your
GitHub repositories into private Discord project spaces, draws commits, branch
graphs and pull requests in a Vercel-style dark theme, and reviews code with a local
AI model.

| Command | What it does |
|---|---|
| `/github login · status · logout` | Connect your GitHub account (read-only, sign-in happens on GitHub) |
| `/project create` | Private category for a repo you own, with text and voice channels |
| `/project invite` | One-click invite link, in a server or any DM; joiners need access to the repo on GitHub |
| `/project ban · unban · mute · unmute` | Moderate the project channels (mutes are timed) |
| `/project delete` | Delete the project's channels after typing the repo name; never the repo |
| `/git commit · tree · pr` | Commit diffs, the branch graph and pull requests |
| `/code-review` | Highlight lines with errors in a file or pasted code |
| `/ping`, `/clear`, `/userinfo`, `/serverinfo`, `/avatar`, `/poll` | Utilities |

**The bot never changes a GitHub repository: it only reads.** To set up your own
copy, follow [docs/setup.md](docs/setup.md).

## Requirements

- Node.js 22.13 or newer (uses the built-in `node:sqlite`)
- A Discord application and bot, and a GitHub App: [docs/setup.md](docs/setup.md)
  creates both step by step
- [uv](https://docs.astral.sh/uv/), for `/code-review` and the `/git` images
  (run `uv sync` in `review/` once)

## GitHub login

`/github login` gives you a button that opens GitHub's own sign-in page:

- **The bot never sees your password.** GitHub gives it a **read-only** token
  instead.
- **You stay logged in** after closing Discord or restarting the bot. Tokens renew
  themselves for up to 6 months.
- **`/github status`** shows which account is connected.
- **`/github logout`** revokes the bot's access on GitHub and deletes its tokens.

## Project channels

### Create a project

`/project create` makes a Discord space for one of your repositories:

- **Pick the repository** by typing in the search box (your repos, private ones
  marked 🔒), or paste its link in the `link` option.
- **Only the repo's owner on GitHub** can create its project.
- **The bot creates a private category named after the repo**, with `general`,
  `commits` and `pull-requests` text channels and `Lounge` and `Pair programming`
  voice channels. At first only you can see it.

### Invite people

`/project invite` works in the server and in any DM, for example in your chat with a
friend. It posts a **Join** button:

- **One click:** your friend confirms their Discord account and signs in to GitHub
  (only the first time). They're added to the server if needed and land in the
  project channel.
- **GitHub decides who gets in:** only people whose GitHub account can see the
  repository can join. For a private repo, add them as collaborators on GitHub.
- **Options:**
  - `user` makes the link work for one person only;
  - `expires` sets how long it lasts: 1 hour, 1 day or 7 days (default).

### Moderate

Only the project owner can moderate. Run these inside a project channel, or pick
the `project` option from anywhere:

| Command | Effect |
|---|---|
| `/project mute user duration` | Can read and listen, can't write or talk. `duration` like `30m`, `2h`, `1d`, `1w` (max 28 days). Lifts automatically, even across bot restarts. |
| `/project unmute user` | Lifts a mute early |
| `/project ban user` | Removes them from the project and blocks their invites |
| `/project unban user` | Lets them join again with a new invite |

Banned or muted people are disconnected from the project's voice channels right
away.

### Delete

`/project delete` asks you to type the repository's exact name, then deletes **only
the Discord channels**. The repository on GitHub is never touched.

## Git views

The `/git` commands work inside a project channel (they use that project's repo), or
anywhere with the `repo` option (`owner/name` or a GitHub link). They also work in
DMs.

### `/git commit hash`

The commit as coloured text:
- short hash, title and message;
- author and date, and the parent commits;
- a `+additions −deletions` summary with a green/red bar;
- a list of every changed file with its own counts;
- each file's diff with old and new line numbers: additions in green with `+`,
  deletions in red with `−`.

Very large commits also come with the full `.diff` attached.

### `/git tree`

The branch and commit graph, like a desktop Git client:

- **Image (default):** coloured lanes per branch, author avatars on each commit,
  branch labels (the default branch highlighted), and author, short hash and date
  on every row.
- **`format:text`:** the same graph drawn with box characters in coloured text.
- **`from` / `to`:** only commits between two days, e.g. `from:2025-01-01
  to:2025-03-31` (format `YYYY-MM-DD`; both optional, `to` includes that whole day).
- **⬆️ / ⬇️:** the bot adds these under the tree. Click one to scroll up or down.
  - Your click disappears straight away, so the arrows stay clean.
  - Pages are prepared ahead of time, so the view changes instantly.
  - The header shows where you are, e.g. *commits 57–88 of 175*.
  - In DMs, where bots can't remove your reaction, every click toggles one step.
  - The arrows disappear after 30 minutes without use.

### `/git pr`

- **`/git pr number:42`:** a card with the state (open, draft, merged or closed),
  title, author, `base ← head` branches, `+/−` lines, files, comments and labels.
  Below it, every commit with its author's avatar, name, message, hash and date.
- **`/git pr` with no number:** the list of open pull requests.

Every view has an **Open on GitHub** button.

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

Install the Python dependencies and download the model once, before the first
review (the model is a few GB):

```sh
cd review
uv sync
uv run hf download LiquidAI/d1-2B
```

The bot loads the model on the first review, which takes about 15 seconds; later
reviews take a few seconds. The model needs about 8 GB of RAM.

The model can miss bugs or flag correct lines. Tune it with `REVIEW_THRESHOLD`
(default `0.8`, higher means fewer lines flagged) or pick another d1 model with
`REVIEW_MODEL`. Before changing the prompt, threshold or model, measure the
change on the sample cases with `uv run python eval.py [model-id]` in `review/`.
The model mostly catches syntax, naming and type mistakes; it often misses
logic bugs such as a wrong loop bound or comparison.

## Security

- **No passwords.** Sign-in happens on Discord's and GitHub's own pages.
- **Read-only.** The GitHub App only has read permissions, and the bot's code only
  reads, so nothing can change your repositories.
- **Encrypted at rest.** GitHub tokens are stored with AES-256-GCM
  (`TOKEN_ENCRYPTION_KEY`). Login and invite links are stored only as SHA-256
  hashes.
- **Identity first.** Every browser flow first proves who you are with Discord, so a
  forwarded link can't connect someone else's GitHub account to yours.
- **Hardened pages.** The sign-in pages send strict security headers and never leak
  links through the referrer.

Never share or commit `.env` or the `data/` folder.

## Setup

**Setting up your own copy from zero?** Follow [docs/setup.md](docs/setup.md). It
creates the Discord bot and the GitHub App step by step and fills in every `.env`
key. The GitHub App form is explained field by field in
[docs/github-app.md](docs/github-app.md).

Quick start once `.env` is filled in:

```sh
npm install
cd review && uv sync && cd ..
npm run deploy:commands
npm run dev
```

Run `npm run deploy:commands` again whenever command definitions change. With
`DISCORD_GUILD_ID` set, commands appear in that server right away; without it they
are registered globally and can take a while to show up.

The sign-in web page runs on `WEB_PORT` (default `3000`). `PUBLIC_URL` must reach
it: `http://localhost:3000` when testing alone, or a public HTTPS address so friends
can use invites (see [docs/setup.md § 4](docs/setup.md#4-choose-web_port-and-public_url)).

## Tests

```sh
npm test
```

## Start the bot (production)

```sh
npm run typecheck
npm run build
npm start
```

Run `npm run deploy:commands` whenever slash-command definitions change. Add
new commands under `src/commands/` and register them in `src/commands/index.ts`.

## Project layout

| Path | What's in it |
|---|---|
| `src/commands/` | One file per slash command |
| `src/github.ts`, `src/web.ts` | GitHub API (read-only), sign-in and invite web flows |
| `src/projects.ts` | Project channels, access, bans and timed mutes |
| `src/gitViews.ts`, `src/render/`, `src/treeScroll.ts` | Commit, tree and PR views, and ⬆️/⬇️ scrolling |
| `src/theme.ts`, `review/theme.py` | The shared Vercel-style palette for text and images |
| `src/db.ts`, `src/security.ts` | SQLite storage and encryption |
| `review/` | Python: the `/code-review` model, and the image renderer for `/git` |
| `docs/` | Setup guide and GitHub App tutorial |
