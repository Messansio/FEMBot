import { createServer } from "node:http";
import type { ServerResponse } from "node:http";
import type { Client } from "discord.js";
import { getGitHubSetup } from "./config.js";
import { deleteExpired, one, run } from "./db.js";
import type { InviteRow, WebFlowRow } from "./db.js";
import { completeGitHubLogin, getGitHubAccount, getGitHubToken, getVisibleRepo, githubAuthorizeUrl } from "./github.js";
import { activeMuteUntil, firstTextChannelId, getProject, isBanned, setAccess } from "./projects.js";
import { decryptSecret, encryptSecret, hashToken, randomToken } from "./security.js";

// Browser side of login and invites. Every flow first proves *who* is in the browser
// with Discord OAuth, so a forwarded link can't tie someone else's GitHub to your
// Discord account. Links carry random tokens; only their SHA-256 is stored.

const FLOW_TTL = 15 * 60 * 1000;

export function createLoginLink(discordUserId: string): string {
  const token = randomToken();
  run(
    "INSERT INTO web_flows (state_hash, kind, discord_user_id, expires_at) VALUES (?, 'login', ?, ?)",
    hashToken(token),
    discordUserId,
    Date.now() + FLOW_TTL,
  );
  return `${getGitHubSetup().publicUrl}/login?flow=${token}`;
}

export function createInviteLink(projectId: number, createdBy: string, invitedUserId: string | null, ttlMs: number): string {
  const token = randomToken();
  run(
    "INSERT INTO invites (token_hash, project_id, invited_discord_id, created_by, expires_at) VALUES (?, ?, ?, ?, ?)",
    hashToken(token),
    projectId,
    invitedUserId,
    createdBy,
    Date.now() + ttlMs,
  );
  return `${getGitHubSetup().publicUrl}/invite/${token}`;
}

// --- Pages -----------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Cache-Control": "no-store",
};

const TONES = { ok: "#00ca50", error: "#ff6166", info: "#47a8ff" };

function page(res: ServerResponse, status: number, title: string, message: string, tone: keyof typeof TONES): void {
  res.writeHead(status, { ...SECURITY_HEADERS, "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · FEMBot</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #000; color: #ededed;
    font: 15px/1.6 Geist, "Geist Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  main { box-sizing: border-box; width: min(440px, calc(100vw - 32px)); padding: 32px; border: 1px solid #262626;
    border-radius: 12px; background: #0a0a0a; }
  .badge { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: #a1a1a1; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: ${TONES[tone]}; box-shadow: 0 0 12px ${TONES[tone]}; }
  h1 { margin: 16px 0 8px; font-size: 22px; font-weight: 600; letter-spacing: -0.02em; }
  p { margin: 0; color: #a1a1a1; }
</style>
</head>
<body><main><span class="badge"><span class="dot"></span>FEMBot</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></main></body>
</html>`);
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { ...SECURITY_HEADERS, Location: location });
  res.end();
}

// --- Flows -----------------------------------------------------------------------------

function getFlow(state: string | null): WebFlowRow | undefined {
  if (!state) return undefined;
  return one<WebFlowRow>("SELECT * FROM web_flows WHERE state_hash = ? AND expires_at > ?", hashToken(state), Date.now());
}

function getInvite(inviteHash: string | null): InviteRow | undefined {
  if (!inviteHash) return undefined;
  return one<InviteRow>("SELECT * FROM invites WHERE token_hash = ? AND expires_at > ?", inviteHash, Date.now());
}

function discordAuthorizeUrl(state: string, scopes: string): string {
  const params = new URLSearchParams({
    client_id: process.env["DISCORD_CLIENT_ID"] ?? "",
    redirect_uri: `${getGitHubSetup().publicUrl}/oauth/discord/callback`,
    response_type: "code",
    scope: scopes,
    state,
    prompt: "none", // skip the consent screen when already authorized
  });
  return `https://discord.com/oauth2/authorize?${params}`;
}

async function discordIdentity(code: string): Promise<{ id: string; accessToken: string }> {
  const { discordClientSecret, publicUrl } = getGitHubSetup();
  const tokenResponse = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env["DISCORD_CLIENT_ID"] ?? "",
      client_secret: discordClientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: `${publicUrl}/oauth/discord/callback`,
    }),
  });
  const token = (await tokenResponse.json()) as { access_token?: string };
  if (!token.access_token) throw new Error(`Discord token exchange failed (${tokenResponse.status}).`);
  const me = (await (
    await fetch("https://discord.com/api/v10/users/@me", { headers: { Authorization: `Bearer ${token.access_token}` } })
  ).json()) as { id?: string };
  if (!me.id) throw new Error("Discord did not return the user.");
  return { id: me.id, accessToken: token.access_token };
}

async function finishInvite(client: Client, flow: WebFlowRow, res: ServerResponse): Promise<void> {
  const invite = getInvite(flow.invite_hash);
  const project = invite && getProject(invite.project_id);
  const userId = flow.discord_user_id;
  if (!invite || !project || !userId) {
    return page(res, 410, "Invite expired", "Ask the project owner for a new invite.", "error");
  }
  const guild = await client.guilds.fetch(project.guild_id).catch(() => null);
  if (!guild) return page(res, 410, "Project unavailable", "The bot is no longer in that server.", "error");
  if (isBanned(project.id, userId)) {
    return page(res, 403, "You can't join this project", "You were banned from it by the owner.", "error");
  }

  const token = await getGitHubToken(userId);
  if (!token) return redirect(res, githubAuthorizeUrl(flowState(flow)));
  const [owner = "", repo = ""] = project.repo_full_name.split("/");
  if (!(await getVisibleRepo(token, owner, repo))) {
    const login = getGitHubAccount(userId)?.login ?? "your account";
    return page(
      res,
      403,
      "No access to the repository",
      `GitHub says @${login} can't see ${project.repo_full_name}. Ask the owner for access on GitHub, then open the invite again.`,
      "error",
    );
  }

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) {
    if (!flow.discord_access_token) throw new Error("Missing Discord authorization for joining.");
    await guild.members.add(userId, { accessToken: decryptSecret(flow.discord_access_token) });
  }
  await setAccess(guild, project, userId, activeMuteUntil(project.id, userId) ? "muted" : "member");

  run("DELETE FROM web_flows WHERE state_hash = ?", flow.state_hash);
  if (invite.invited_discord_id) run("DELETE FROM invites WHERE token_hash = ?", invite.token_hash);
  redirect(res, `https://discord.com/channels/${guild.id}/${firstTextChannelId(guild, project)}`);
}

// The raw state is only known from the current request; keep it per request.
const stateOf = new WeakMap<WebFlowRow, string>();
function flowState(flow: WebFlowRow): string {
  const state = stateOf.get(flow);
  if (!state) throw new Error("Flow state unavailable.");
  return state;
}

async function handle(client: Client, url: URL, res: ServerResponse): Promise<void> {
  const path = url.pathname;

  if (path === "/login") {
    const state = url.searchParams.get("flow");
    const flow = getFlow(state);
    if (!flow || flow.kind !== "login" || !state) {
      return page(res, 410, "Link expired", "Run /github login in Discord to get a new link.", "error");
    }
    return redirect(res, discordAuthorizeUrl(state, "identify"));
  }

  const inviteMatch = path.match(/^\/invite\/([\w-]{20,})$/);
  if (inviteMatch?.[1]) {
    const inviteHash = hashToken(inviteMatch[1]);
    if (!getInvite(inviteHash)) {
      return page(res, 410, "Invite expired", "Ask the project owner for a new invite.", "error");
    }
    const state = randomToken();
    run(
      "INSERT INTO web_flows (state_hash, kind, invite_hash, expires_at) VALUES (?, 'invite', ?, ?)",
      hashToken(state),
      inviteHash,
      Date.now() + FLOW_TTL,
    );
    return redirect(res, discordAuthorizeUrl(state, "identify guilds.join"));
  }

  if (path === "/oauth/discord/callback") {
    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    const flow = getFlow(state);
    if (!flow || !state) return page(res, 410, "Link expired", "Start again from Discord.", "error");
    if (!code) return page(res, 400, "Cancelled", "Discord authorization was cancelled.", "info");
    stateOf.set(flow, state);

    const identity = await discordIdentity(code);
    if (flow.kind === "login") {
      if (identity.id !== flow.discord_user_id) {
        return page(res, 403, "Wrong Discord account", "This login link belongs to another Discord account.", "error");
      }
      run("UPDATE web_flows SET verified = 1 WHERE state_hash = ?", flow.state_hash);
      return redirect(res, githubAuthorizeUrl(state));
    }

    const invite = getInvite(flow.invite_hash);
    if (!invite) return page(res, 410, "Invite expired", "Ask the project owner for a new invite.", "error");
    if (invite.invited_discord_id && invite.invited_discord_id !== identity.id) {
      return page(res, 403, "Wrong Discord account", "This invite was made for another Discord account.", "error");
    }
    run(
      "UPDATE web_flows SET verified = 1, discord_user_id = ?, discord_access_token = ? WHERE state_hash = ?",
      identity.id,
      encryptSecret(identity.accessToken),
      flow.state_hash,
    );
    const updated = getFlow(state) as WebFlowRow;
    stateOf.set(updated, state);
    return finishInvite(client, updated, res);
  }

  if (path === "/oauth/github/callback") {
    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    const flow = getFlow(state);
    if (!flow || !state || !flow.verified || !flow.discord_user_id) {
      return page(res, 410, "Link expired", "Start again from Discord.", "error");
    }
    if (!code) return page(res, 400, "Cancelled", "GitHub authorization was cancelled.", "info");
    stateOf.set(flow, state);

    const user = await completeGitHubLogin(flow.discord_user_id, code);
    if (flow.kind === "invite") return finishInvite(client, flow, res);
    run("DELETE FROM web_flows WHERE state_hash = ?", flow.state_hash);
    return page(res, 200, `Logged in as @${user.login}`, "You can close this tab and go back to Discord.", "ok");
  }

  return page(res, 404, "Not found", "There is nothing here.", "info");
}

export function startWebServer(client: Client): void {
  const { webPort, publicUrl } = getGitHubSetup();
  const publicLocal = new URL(publicUrl);
  if (["localhost", "127.0.0.1"].includes(publicLocal.hostname) && Number(publicLocal.port || 80) !== webPort) {
    console.warn(`PUBLIC_URL (${publicUrl}) doesn't use WEB_PORT ${webPort}: sign-in links won't reach the bot.`);
  }
  setInterval(deleteExpired, 10 * 60 * 1000).unref();
  createServer((req, res) => {
    if (req.method !== "GET") return page(res, 405, "Method not allowed", "Only links from Discord work here.", "error");
    const url = new URL(req.url ?? "/", publicUrl);
    handle(client, url, res).catch((error: unknown) => {
      console.error("Web flow failed:", error);
      if (!res.headersSent) page(res, 500, "Something went wrong", "Please start again from Discord.", "error");
    });
  }).listen(webPort, () => console.info(`OAuth server listening on :${webPort} (${publicUrl})`));
}
