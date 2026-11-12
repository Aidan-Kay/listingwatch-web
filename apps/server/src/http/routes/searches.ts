import { matchListInputSchema, searchInputSchema } from "@listingwatch/shared/schemas";
import { z } from "zod";
import { requestSignal, type App, type HttpDeps } from "../context.ts";

const idParams = z.object({ id: z.string().min(1) });

export function registerSearchRoutes(app: App, deps: HttpDeps): void {
  const { searches, lists, polling } = deps;

  app.get("/api/searches", async () => searches.list());

  app.post("/api/searches", { schema: { body: searchInputSchema } }, async (request, reply) => reply.code(201).send(searches.create(request.body)));

  app.put("/api/searches/:id", { schema: { params: idParams, body: searchInputSchema } }, async (request) =>
    searches.update(request.params.id, request.body),
  );

  app.patch(
    "/api/searches/:id",
    { schema: { params: idParams, body: z.object({ enabled: z.boolean().optional(), notify: z.boolean().optional() }) } },
    async (request) => searches.setFlags(request.params.id, request.body),
  );

  app.post("/api/searches/:id/duplicate", { schema: { params: idParams } }, async (request, reply) =>
    reply.code(201).send(searches.duplicate(request.params.id)),
  );

  app.delete("/api/searches/:id", { schema: { params: idParams } }, async (request, reply) => {
    searches.delete(request.params.id);
    return reply.code(204).send();
  });

  app.post("/api/searches/test", { schema: { body: searchInputSchema } }, async (request, reply) =>
    searches.test(request.body, requestSignal(reply, 60_000)),
  );

  app.get("/api/polling", async () => ({ paused: polling.paused }));
  app.post("/api/polling/pause", async () => {
    polling.pause();
    return { paused: true };
  });
  app.post("/api/polling/resume", async () => {
    polling.resume();
    return { paused: false };
  });

  app.get("/api/lists", async () => lists.list());
  app.post("/api/lists", { schema: { body: matchListInputSchema } }, async (request, reply) => reply.code(201).send(lists.create(request.body)));
  app.put("/api/lists/:id", { schema: { params: idParams, body: matchListInputSchema } }, async (request) => lists.update(request.params.id, request.body));
  app.delete("/api/lists/:id", { schema: { params: idParams } }, async (request, reply) => {
    lists.delete(request.params.id);
    return reply.code(204).send();
  });
}
