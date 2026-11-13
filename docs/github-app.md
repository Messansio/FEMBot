# Tutorial: create and set up the GitHub App

The bot signs people in to GitHub through a **GitHub App** you own. This guide goes
through GitHub's form field by field. It takes about 10 minutes.

When you're done you'll have 3 values for `.env`:

| `.env` variable | Where it comes from |
|---|---|
| `GITHUB_CLIENT_ID` | The app's *Client ID* |
| `GITHUB_CLIENT_SECRET` | A *client secret* you generate |
| `GITHUB_APP_SLUG` | The app's short name in its public URL |

**Before you start, decide on `PUBLIC_URL`**: the address where browsers reach the
bot's web server, on the port set by `WEB_PORT` (default `3000`). For testing on your
own computer it's `http://localhost:3000`; for friends it must be a public HTTPS
address (see [github-setup.md § 1](github-setup.md#1-pick-the-bots-public-url)). You
can change it later, as described at the end of this guide.

## Why a GitHub App, not a token or an OAuth App

- **Read-only by design.** You pick exactly which data the app may read. With
  read-only permissions, the bot can't change a repository even if its code had a
  bug.
- **Short-lived tokens.** Sign-ins give the bot a token that expires after 8 hours
  and renews itself. Personal access tokens and OAuth Apps can't be limited to
  read-only access to private code.
- **People stay in control.** Anyone can revoke the bot's access from their GitHub
  settings at any time.

## Step 1: Open the "new GitHub App" form

- **For your personal account:** go to <https://github.com/settings/apps/new>.

  Or click your avatar (top right), then **Settings**, then **Developer settings**
  (at the bottom of the left sidebar), **GitHub Apps** and **New GitHub App**.
- **For an organization:** go to the organization's page, then **Settings →
  Developer settings → GitHub Apps → New GitHub App**.

GitHub may ask for your password or 2FA code: that's GitHub protecting your account,
and it never reaches the bot.

## Step 2: Fill in "Register new GitHub App"

Go down the form in order:

### GitHub App name

A name that's unique on all of GitHub, e.g. `FEMBot-yourname`. People see it on the
sign-in page ("FEMBot-yourname wants to access your account").

### Description (optional)

For example: *Discord bot that shows your repositories' commits, branches and pull
requests. Read-only.*

### Homepage URL

Any page about the bot, e.g. your repository `https://github.com/you/FEMBot`.
GitHub requires one; the bot doesn't use it.

### Identifying and authorizing users

| Field | Value |
|---|---|
| **Callback URL** | `PUBLIC_URL` + `/oauth/github/callback`, e.g. `http://localhost:3000/oauth/github/callback` |
| **Expire user authorization tokens** | ✅ Keep it **checked** |
| **Request user authorization (OAuth) during installation** | ⬜ Unchecked |
| **Enable Device Flow** | ⬜ Unchecked |

The callback URL must match `PUBLIC_URL` exactly, including `http`/`https` and the
port. Otherwise GitHub refuses the sign-in with *"redirect_uri is not associated with
this application"*.

### Post installation

Leave **Setup URL** empty, and leave **Redirect on update** unchecked.

### Webhook

**Uncheck "Active".** The bot doesn't receive webhooks, so the Webhook URL and
secret fields disappear.

### Permissions

Open **Repository permissions** and set exactly these three. Everything else stays at
**No access**:

| Permission | Set to | What the bot shows with it |
|---|---|---|
| **Contents** | Read-only | Commits, diffs, branches (`/git commit`, `/git tree`) |
| **Metadata** | Read-only | Repository name, owner, visibility. GitHub sets this automatically. |
| **Pull requests** | Read-only | `/git pr` |

Leave **Organization permissions** and **Account permissions** at *No access*. The
bot doesn't need your email or anything else about your account.

> Never pick *Read and write* for any permission. The bot never needs it, and read-only
> is what guarantees it can't change your code.

### Subscribe to events

Leave everything unchecked (there's no webhook).

### Where can this GitHub App be installed?

- **Only on this account**: only you can install it. Pick this if you'll be the only
  one creating projects.
- **Any account**: other people can install it on their own repositories, so they can
  create projects for their private repos too.

Either way, anyone can still *sign in* with the app and join projects. This setting
only controls installing it on repositories.

Click **Create GitHub App**.

## Step 3: Copy the IDs and create a secret

You land on the app's **General** page.

1. **Client ID**: near the top, under *About*, it looks like `Iv23li…`. Copy it into
   `GITHUB_CLIENT_ID`.
   - Don't use the *App ID* (a number) by mistake.
2. **Client secrets**: click **Generate a new client secret**. Copy it right away
   into `GITHUB_CLIENT_SECRET`: GitHub shows it only once. If you lose it, generate a
   new one and delete the old one.
3. **Slug**: click **Public page** in the left sidebar. The URL is
   `https://github.com/apps/<slug>`. Copy `<slug>` (e.g. `fembot-yourname`) into
   `GITHUB_APP_SLUG`.

Skip **Private keys** further down the page: they're for apps that act as
themselves, and this bot only acts as the signed-in person.

## Step 4: Install the app on your repositories

This is what lets the bot see **private** repositories. Public repositories work
without it.

1. Click **Install App** in the left sidebar.
2. Click **Install** next to your account or organization.
3. Choose one:
   - **All repositories**: including ones you create later.
   - **Only select repositories**: pick the repos you'll make projects for.
4. Click **Install**.

GitHub shows the read-only permissions again. That's the whole list of what the bot
can read.

**Repositories owned by other people:** the owner installs the app on their own
account. For that, set *Any account* in step 2. People you invite to a project
don't install anything: they just sign in, and GitHub checks they can see the repo.

## Step 5: Check it works

1. Put the three values in `.env`, along with the other variables from
   [github-setup.md](github-setup.md).
2. Start the bot with `npm run dev`. The console shows:
   `OAuth server listening on :3000 (http://localhost:3000)`
3. In Discord, run `/github login` and click the button.
   - Discord asks to confirm your account.
   - GitHub shows **"Authorize FEMBot-yourname"** with *read-only* access.
   - Click **Authorize**.
4. The page says **Logged in as @you**. Run `/github status` in Discord to see your
   account.
5. Run `/git tree repo:you/a-private-repo`. If you get *"can't see"*, the app isn't
   installed on that repo (step 4).

## Changing things later

| You want to… | Do this |
|---|---|
| Change `PUBLIC_URL` or `WEB_PORT` | Update `.env`, then update the **Callback URL** in *Settings → Developer settings → GitHub Apps → your app → General*, and the redirect in the Discord portal. Restart the bot. |
| Add or remove repositories | *Install App → ⚙ Configure* next to your account. |
| Rotate the client secret | Generate a new secret, put it in `.env`, restart, then delete the old secret. Nobody gets logged out. |
| Log everyone out | Revoke all user tokens on the app's *General* page (*Revoke all user tokens*). |
| Remove the bot's access to your own account | <https://github.com/settings/apps/authorizations> → the app → **Revoke**, or `/github logout` in Discord. |
| Delete the app | App's *Advanced* tab → **Delete GitHub App**. All sign-ins stop working. |

## Common errors

| Message | Cause | Fix |
|---|---|---|
| *The redirect_uri is not associated with this application* | Callback URL ≠ `PUBLIC_URL/oauth/github/callback` | Make them match exactly (scheme, host, port). |
| *Bad credentials* / *incorrect client credentials* in the bot's console | Wrong or deleted client secret, or App ID used instead of Client ID | Copy the **Client ID** again; generate a new secret. |
| `/project create` says it *can't see* your private repo | App not installed on that repository | Step 4. |
| Invited friend: *No access to the repository* | Their GitHub account isn't a collaborator | Add them on GitHub (*repo → Settings → Collaborators*), then they click the invite again. |
| GitHub asks to authorize every time | Normal after a logout or revoke | Nothing to fix. |
