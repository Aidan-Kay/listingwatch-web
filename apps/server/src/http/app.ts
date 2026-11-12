import fs from "node:fs";
import path from "node:path";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import Fastify, { LogController, type FastifyBaseLogger } from "fastify";
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import type { Logger } from "../logger.ts";
import type { App, HttpDeps } from "./context.ts";
import { registerErrorHandler } from "./errors.ts";
import { registerFeedRoutes } from "./routes/feed.ts";
import { registerLiveRoutes } from "./routes/live.ts";
import { registerSearchRoutes } from "./routes/searches.ts";
import { registerSettingsRoutes } from "./routes/settings.ts";

/**
 * Content-Security-Policy for the web app. Listing photos come from the
 * marketplaces' CDNs, so images may load from any https origin; everything
 * else is same-origin. Inline styles are needed by the UI component library.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

export async function buildHttpApp(deps: HttpDeps, log: Logger): Promise<App> {
  const app = Fastify({
    loggerInstance: log as FastifyBaseLogger,
    logController: new LogController({ disableRequestLogging: true }),
    // Only nginx on the same host sits in front; trust its forwarded headers.
    trustProxy: "127.0.0.1,::1",
  }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);
  addSecurityHeaders(app);
  await app.register(multipart);

  registerSearchRoutes(app, deps);
  registerFeedRoutes(app, deps);
  registerSettingsRoutes(app, deps);
  registerLiveRoutes(app, deps);
  await serveWebApp(app, deps.config.paths.webDist, log);
  return app;
}

function addSecurityHeaders(app: App): void {
  app.addHook("onSend", async (_request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    if (String(reply.getHeader("content-type") ?? "").startsWith("text/html")) {
      reply.header("Content-Security-Policy", CONTENT_SECURITY_POLICY);
    }
  });
}

/**
 * Serve the built web app, with unknown non-API paths falling back to
 * index.html so client-side routes survive a reload.
 */
async function serveWebApp(app: App, distDir: string, log: Logger): Promise<void> {
  const indexFile = path.join(distDir, "index.html");
  if (!fs.existsSync(indexFile)) {
    log.warn({ distDir }, "Web app not built; only the API is served");
    app.setNotFoundHandler(async (_request, reply) => reply.code(404).send({ error: { code: "not_found", message: "No such endpoint" } }));
    return;
  }
  await app.register(fastifyStatic, {
    root: distDir,
    setHeaders(response, filePath) {
      // Hashed assets never change; everything else (index.html, the service worker) must revalidate.
      const immutable = filePath.includes(`${path.sep}assets${path.sep}`);
      response.header("Cache-Control", immutable ? "public, max-age=31536000, immutable" : "no-cache");
    },
  });
  app.setNotFoundHandler(async (request, reply) => {
    // Only page routes fall back to the app; a missing asset (an old hashed file) is a plain 404.
    const pathname = request.url.split("?")[0]!;
    if (request.method !== "GET" || pathname.startsWith("/api/") || path.extname(pathname) !== "") {
      return reply.code(404).send({ error: { code: "not_found", message: "Not found" } });
    }
    return reply.type("text/html").header("Cache-Control", "no-cache").sendFile("index.html");
  });
}
