import { getGitHubSetup } from "./config.js";
import { one, run } from "./db.js";
import type { GitHubAccountRow } from "./db.js";
import { decryptSecret, encryptSecret } from "./security.js";
import { UserError } from "./errors.js";

// The bot only ever reads from GitHub: every API call goes through githubGet or a
// read-only GraphQL query. Nothing here can change a repository.

const API = "https://api.github.com";
const HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "FEMBot",
};

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class NotLoggedInError extends UserError {
  constructor() {
    super("You're not logged in to GitHub. Run `/github login` first.");
  }
}

export interface GitHubUser {
  id: number;
  login: string;
  avatar_url: string;
  name: string | null;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string | null;
  default_branch: string;
  owner: { login: string; type: string };
}

export async function githubGet<T>(token: string, path: string, accept?: string): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    headers: { ...HEADERS, Authorization: `Bearer ${token}`, ...(accept ? { Accept: accept } : {}) },
  });
  if (!response.ok) {
    throw new GitHubError(response.status, `GitHub returned ${response.status} for ${path}`);
  }
  return (accept?.includes("diff") ? response.text() : response.json()) as Promise<T>;
}

export async function githubQuery<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  if (!/^\s*query\b/.test(query)) throw new Error("Only read-only GraphQL queries are allowed.");
  const response = await fetch(`${API}/graphql`, {
    method: "POST",
    headers: { ...HEADERS, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json()) as { data?: T; errors?: { message: string }[] };
  if (!response.ok || !body.data) {
    throw new GitHubError(response.status, body.errors?.[0]?.message ?? `GraphQL ${response.status}`);
  }
  return body.data;
}

// --- OAuth (GitHub App user authorization) ------------------------------------

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
}

export function githubAuthorizeUrl(state: string): string {
  const { githubClientId, publicUrl } = getGitHubSetup();
  const params = new URLSearchParams({
    client_id: githubClientId,
    redirect_uri: `${publicUrl}/oauth/github/callback`,
    state,
    allow_signup: "false",
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

async function requestToken(params: Record<string, string>): Promise<TokenResponse & { access_token: string }> {
  const { githubClientId, githubClientSecret } = getGitHubSetup();
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "FEMBot" },
    body: JSON.stringify({ client_id: githubClientId, client_secret: githubClientSecret, ...params }),
  });
  const body = (await response.json()) as TokenResponse;
  if (!body.access_token) {
    throw new GitHubError(response.status, body.error_description ?? body.error ?? "GitHub login failed.");
  }
  return body as TokenResponse & { access_token: string };
}

function saveTokens(discordUserId: string, user: GitHubUser, tokens: TokenResponse & { access_token: string }): void {
  const now = Date.now();
  run(
    `INSERT INTO github_accounts (discord_user_id, github_id, login, avatar_url, access_token,
       access_expires_at, refresh_token, refresh_expires_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (discord_user_id) DO UPDATE SET github_id = excluded.github_id, login = excluded.login,
       avatar_url = excluded.avatar_url, access_token = excluded.access_token,
       access_expires_at = excluded.access_expires_at, refresh_token = excluded.refresh_token,
       refresh_expires_at = excluded.refresh_expires_at, updated_at = excluded.updated_at`,
    discordUserId,
    user.id,
    user.login,
    user.avatar_url,
    encryptSecret(tokens.access_token),
    tokens.expires_in ? now + tokens.expires_in * 1000 : null,
    tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null,
    tokens.refresh_token_expires_in ? now + tokens.refresh_token_expires_in * 1000 : null,
    now,
  );
}

/** Finishes the browser login: exchanges the code and stores the encrypted tokens. */
export async function completeGitHubLogin(discordUserId: string, code: string): Promise<GitHubUser> {
  const tokens = await requestToken({ code });
  const user = await githubGet<GitHubUser>(tokens.access_token, "/user");
  saveTokens(discordUserId, user, tokens);
  return user;
}

export function getGitHubAccount(discordUserId: string): GitHubAccountRow | undefined {
  return one<GitHubAccountRow>("SELECT * FROM github_accounts WHERE discord_user_id = ?", discordUserId);
}

/** A valid access token for this Discord user, refreshed when expired; undefined when logged out. */
export async function getGitHubToken(discordUserId: string): Promise<string | undefined> {
  const account = getGitHubAccount(discordUserId);
  if (!account) return undefined;

  const now = Date.now();
  if (!account.access_expires_at || account.access_expires_at - 60_000 > now) {
    return decryptSecret(account.access_token);
  }
  if (!account.refresh_token || (account.refresh_expires_at ?? 0) < now) {
    run("DELETE FROM github_accounts WHERE discord_user_id = ?", discordUserId);
    return undefined;
  }

  try {
    const tokens = await requestToken({
      grant_type: "refresh_token",
      refresh_token: decryptSecret(account.refresh_token),
    });
    const user = await githubGet<GitHubUser>(tokens.access_token, "/user");
    saveTokens(discordUserId, user, tokens);
    return tokens.access_token;
  } catch (error) {
    if (error instanceof GitHubError) {
      // Refresh rejected (revoked on GitHub): the session is over.
      run("DELETE FROM github_accounts WHERE discord_user_id = ?", discordUserId);
      return undefined;
    }
    throw error;
  }
}

export async function requireGitHubToken(discordUserId: string): Promise<string> {
  const token = await getGitHubToken(discordUserId);
  if (!token) throw new NotLoggedInError();
  return token;
}

/** Logs out: revokes the app authorization on GitHub and forgets the tokens. */
export async function logoutGitHub(discordUserId: string): Promise<boolean> {
  const account = getGitHubAccount(discordUserId);
  if (!account) return false;

  const { githubClientId, githubClientSecret } = getGitHubSetup();
  await fetch(`${API}/applications/${githubClientId}/token`, {
    method: "DELETE",
    headers: {
      ...HEADERS,
      Authorization: `Basic ${Buffer.from(`${githubClientId}:${githubClientSecret}`).toString("base64")}`,
    },
    body: JSON.stringify({ access_token: decryptSecret(account.access_token) }),
  }).catch(() => undefined); // best effort: the local session is removed either way
  run("DELETE FROM github_accounts WHERE discord_user_id = ?", discordUserId);
  return true;
}

// --- Repositories --------------------------------------------------------------

/** "owner/repo", https://github.com/owner/repo[...], or git@github.com:owner/repo.git */
export function parseRepoReference(input: string): { owner: string; repo: string } | undefined {
  const match = input
    .trim()
    .match(/^(?:https?:\/\/(?:www\.)?github\.com\/|git@github\.com:)?([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/?#].*)?$/i);
  if (!match?.[1] || !match[2]) return undefined;
  return { owner: match[1], repo: match[2] };
}

/** The repo as this user's token sees it, or undefined when they can't see it. */
export async function getVisibleRepo(token: string, owner: string, repo: string): Promise<GitHubRepo | undefined> {
  try {
    return await githubGet<GitHubRepo>(token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  } catch (error) {
    if (error instanceof GitHubError && (error.status === 404 || error.status === 403)) return undefined;
    throw error;
  }
}

export function appInstallUrl(): string {
  return `https://github.com/apps/${getGitHubSetup().githubAppSlug}/installations/new`;
}
