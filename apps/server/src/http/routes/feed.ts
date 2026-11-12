import { sourceSchema } from "@listingwatch/shared/schemas";
import { z } from "zod";
import { requestSignal, type App, type HttpDeps } from "../context.ts";

const keyParams = z.object({ key: z.string().regex(/^(ebay|vinted):\d+$/, "Not a listing key") });

export function registerFeedRoutes(app: App, deps: HttpDeps): void {
  const { feed, adapters } = deps;

  app.get("/api/feed", async () => feed.feed());

  app.post("/api/feed/seen", async () => ({ seenAt: feed.markSeen() }));

  app.delete("/api/feed", async (_request, reply) => {
    feed.clear();
    return reply.code(204).send();
  });

  app.delete("/api/feed/:key", { schema: { params: keyParams } }, async (request, reply) => {
    feed.dismiss(request.params.key);
    return reply.code(204).send();
  });

  app.get("/api/favourites", async () => feed.favourites());

  app.put("/api/favourites/:key", { schema: { params: keyParams } }, async (request, reply) => {
    feed.addFavourite(request.params.key);
    return reply.code(204).send();
  });

  app.delete("/api/favourites/:key", { schema: { params: keyParams } }, async (request, reply) => {
    feed.removeFavourite(request.params.key);
    return reply.code(204).send();
  });

  app.delete("/api/favourites", async (_request, reply) => {
    feed.clearFavourites();
    return reply.code(204).send();
  });

  app.get(
    "/api/listings/:source/:itemId/images",
    { schema: { params: z.object({ source: sourceSchema, itemId: z.string().regex(/^\d+$/) }), querystring: z.object({ site: z.string().min(2).max(2) }) } },
    async (request, reply) => ({
      images: await adapters[request.params.source].itemImages(request.params.itemId, request.query.site, requestSignal(reply, 20_000)),
    }),
  );
}
