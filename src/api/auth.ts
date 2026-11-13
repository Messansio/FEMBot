import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import type { ApiUser } from "./types.js";

const DISCORD_API = "https://discord.com/api/v10";
const redirectUri = `${config.dashboardUrl}/auth/callback`;

export interface SessionUser {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
  accessToken: string;
  expiresAt: number;
}

declare module "@fastify/secure-session" {
  interface SessionData {
    user: SessionUser;
    oauthState: string;
  }
}

export interface DiscordPartialGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

export function toApiUser(user: SessionUser): ApiUser {
  return {
    id: user.id,
    username: user.username,
    globalName: user.globalName,
    avatarUrl: user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
      : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(user.id) >> 22n) % 6n)}.png`,
  };
}

/** Returns the logged-in user or sends 401. */
export function requireUser(request: FastifyRequest, reply: FastifyReply): SessionUser | null {
  const user = request.session.get("user");
  if (!user || user.expiresAt < Date.now()) {
    request.session.delete();
    void reply.code(401).send({ error: "Not logged in" });
    return null;
  }
  return user;
}

const userGuildCache = new Map<string, { at: number; guilds: DiscordPartialGuild[] }>();

/** The user's guilds from Discord, cached for 60 seconds to respect rate limits. */
export async function fetchUserGuilds(user: SessionUser): Promise<DiscordPartialGuild[]> {
  const cached = userGuildCache.get(user.id);
  if (cached && Date.now() - cached.at < 60_000) return cached.guilds;

  const response = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${user.accessToken}` },
  });
  if (!response.ok) {
    if (cached) return cached.guilds;
    throw new Error(`Discord returned ${response.status} for user guilds`);
  }
  const guilds = (await response.json()) as DiscordPartialGuild[];
  userGuildCache.set(user.id, { at: Date.now(), guilds });
  return guilds;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get("/auth/login", async (request, reply) => {
    const state = randomBytes(24).toString("hex");
    request.session.set("oauthState", state);
    const params = new URLSearchParams({
      client_id: config.discordClientId,
      response_type: "code",
      scope: "identify guilds",
      redirect_uri: redirectUri,
      state,
      prompt: "none",
    });
    return reply.redirect(`https://discord.com/oauth2/authorize?${params}`);
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    "/auth/callback",
    async (request, reply) => {
      const { code, state, error } = request.query;
      const expectedState = request.session.get("oauthState");
      request.session.set("oauthState", undefined);

      if (error || !code || !state || !expectedState || state !== expectedState) {
        return reply.redirect(`${config.dashboardUrl}/?login=failed`);
      }

      const tokenResponse = await fetch(`${DISCORD_API}/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.discordClientId,
          client_secret: config.discordClientSecret ?? "",
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      });
      if (!tokenResponse.ok) {
        request.log.warn(`OAuth token exchange failed: ${tokenResponse.status}`);
        return reply.redirect(`${config.dashboardUrl}/?login=failed`);
      }
      const token = (await tokenResponse.json()) as { access_token: string; expires_in: number };

      const userResponse = await fetch(`${DISCORD_API}/users/@me`, {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      if (!userResponse.ok) return reply.redirect(`${config.dashboardUrl}/?login=failed`);
      const user = (await userResponse.json()) as {
        id: string;
        username: string;
        global_name: string | null;
        avatar: string | null;
      };

      request.session.set("user", {
        id: user.id,
        username: user.username,
        globalName: user.global_name,
        avatar: user.avatar,
        accessToken: token.access_token,
        expiresAt: Date.now() + Math.min(token.expires_in * 1000, 7 * 86_400_000),
      });
      userGuildCache.delete(user.id);
      return reply.redirect(`${config.dashboardUrl}/`);
    },
  );

  app.post("/auth/logout", async (request, reply) => {
    request.session.delete();
    return reply.send({ ok: true });
  });

  app.get("/api/me", async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    return toApiUser(user);
  });
}
