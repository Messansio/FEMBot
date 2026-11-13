import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import secureSession from "@fastify/secure-session";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { config } from "../config.js";
import { authRoutes } from "./auth.js";
import { requireGuildManager } from "./guard.js";
import { communityRoutes } from "./routes/community.js";
import { guildInfoRoutes, guildListRoutes } from "./routes/guilds.js";
import { moderationRoutes } from "./routes/moderation.js";
import { settingsRoutes } from "./routes/settings.js";

const webDist = resolve(dirname(fileURLToPath(import.meta.url)), "../../web/dist");
const allowedOrigin = new URL(config.dashboardUrl).origin;

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.isProduction ? "warn" : "info" },
    trustProxy: config.isProduction,
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https://cdn.discordapp.com"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
      },
    },
  });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  await app.register(secureSession, {
    cookieName: "session",
    // 32-byte key derived from SESSION_SECRET
    key: createHash("sha256").update(config.sessionSecret ?? "").digest(),
    expiry: 7 * 86_400,
    cookie: {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: config.isProduction,
    },
  });

  app.decorateRequest("guildContext", null);

  // CSRF protection: state-changing requests must come from the dashboard origin.
  app.addHook("onRequest", async (request, reply) => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
    if (request.headers.origin !== allowedOrigin) {
      await reply.code(403).send({ error: "Invalid origin" });
    }
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    void reply.code(status).send({ error: status >= 500 ? "Internal server error" : (error as Error).message });
  });

  await app.register(authRoutes);
  await app.register(guildListRoutes);
  await app.register(
    async (guildScope) => {
      guildScope.addHook("preHandler", requireGuildManager);
      await guildScope.register(guildInfoRoutes);
      await guildScope.register(settingsRoutes);
      await guildScope.register(moderationRoutes);
      await guildScope.register(communityRoutes);
    },
    { prefix: "/api/guilds/:guildId" },
  );

  // Production: serve the built dashboard and fall back to index.html for client-side routes.
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false });
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith("/api") || request.url.startsWith("/auth")) {
        return reply.code(404).send({ error: "Not found" });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}

export async function startApi(): Promise<FastifyInstance | null> {
  if (!config.discordClientSecret) {
    console.warn("DISCORD_CLIENT_SECRET not set: web dashboard API disabled.");
    return null;
  }
  const app = await buildServer();
  await app.listen({ port: config.apiPort, host: "0.0.0.0" });
  console.info(`Dashboard API listening on port ${config.apiPort}`);
  return app;
}
