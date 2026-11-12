import { presenceSchema, pushSubscriptionSchema } from "@listingwatch/shared/schemas";
import { z } from "zod";
import type { App, HttpDeps } from "../context.ts";

export function registerLiveRoutes(app: App, deps: HttpDeps): void {
  const { sse, presence, push, repos, now } = deps;

  /** Server-sent events. `clientId` ties the stream to the browser's presence reports. */
  app.get("/api/events", { schema: { querystring: z.object({ clientId: presenceSchema.shape.clientId.optional() }) } }, async (request, reply) => {
    reply.hijack();
    const clientId = request.query.clientId;
    sse.attach(reply.raw, () => {
      if (clientId) presence.forget(clientId);
    });
  });

  app.post("/api/presence", { schema: { body: presenceSchema } }, async (request, reply) => {
    presence.report(request.body.clientId, request.body.visible);
    return reply.code(204).send();
  });

  app.get("/api/push/vapid-key", async () => ({ publicKey: push.publicKey }));

  app.post("/api/push/subscriptions", { schema: { body: pushSubscriptionSchema } }, async (request, reply) => {
    const { endpoint, keys } = request.body;
    repos.pushSubscriptions.upsert({ endpoint, p256dh: keys.p256dh, auth: keys.auth }, request.headers["user-agent"] ?? null, now().toISOString());
    return reply.code(204).send();
  });

  app.delete("/api/push/subscriptions", { schema: { body: z.object({ endpoint: z.url() }) } }, async (request, reply) => {
    repos.pushSubscriptions.delete(request.body.endpoint);
    return reply.code(204).send();
  });

  app.get("/api/health", async () => ({ ok: true, revision: deps.config.revision, polling: !deps.polling.paused, liveClients: sse.size }));
}
