import fs from "node:fs";
import { EBAY_SITE_CODES } from "@listingwatch/shared/marketplaces";
import { ebayCredentialsInputSchema, proxyUrlSchema, settingsSchema } from "@listingwatch/shared/schemas";
import { z } from "zod";
import { badRequest } from "../../services/errors.ts";
import { MAX_SOUND_BYTES } from "../../services/settings-service.ts";
import { requestSignal, type App, type HttpDeps } from "../context.ts";

export function registerSettingsRoutes(app: App, deps: HttpDeps): void {
  const { settings, taxonomy, usage, backup } = deps;

  app.get("/api/settings", async () => settings.view());
  app.put("/api/settings", { schema: { body: settingsSchema } }, async (request) => settings.update(request.body));

  app.put("/api/settings/ebay-credentials", { schema: { body: ebayCredentialsInputSchema } }, async (request) => settings.setEbayCredentials(request.body));
  app.delete("/api/settings/ebay-credentials", async () => settings.clearEbayCredentials());
  app.post("/api/ebay/test-connection", async (_request, reply) => settings.testEbayConnection(requestSignal(reply, 30_000)));

  app.post("/api/settings/test-proxy", { schema: { body: z.object({ url: proxyUrlSchema }) } }, async (request) => {
    if (request.body.url === "") throw badRequest("Enter a proxy URL to test");
    return settings.testProxy(request.body.url);
  });

  app.get("/api/settings/sound", async (_request, reply) => {
    const sound = settings.sound();
    return reply.type(sound.contentType).header("Cache-Control", "no-cache").send(fs.createReadStream(sound.path));
  });
  app.put("/api/settings/sound", async (request) => {
    const file = await request.file({ limits: { fileSize: MAX_SOUND_BYTES, files: 1 } });
    if (!file) throw badRequest("Attach a sound file");
    const data = await file.toBuffer();
    if (file.file.truncated) throw badRequest("Sound files can be up to 2 MB");
    return settings.saveSound(data, file.mimetype, file.filename);
  });
  app.delete("/api/settings/sound", async () => settings.deleteSound());

  const siteParams = z.object({ site: z.enum(EBAY_SITE_CODES) });
  app.get("/api/ebay/:site/categories", { schema: { params: siteParams } }, async (request, reply) =>
    taxonomy.categories(request.params.site, requestSignal(reply, 90_000)),
  );
  app.get(
    "/api/ebay/:site/categories/:categoryId/conditions",
    { schema: { params: siteParams.extend({ categoryId: z.string().regex(/^\d+$/) }) } },
    async (request, reply) => taxonomy.conditions(request.params.site, request.params.categoryId, requestSignal(reply, 30_000)),
  );
  app.get("/api/ebay/usage", async () => usage.usage());

  app.get("/api/backup", async (_request, reply) => {
    const day = deps.now().toISOString().slice(0, 10);
    return reply.header("Content-Disposition", `attachment; filename="listingwatch-backup-${day}.json"`).send(backup.export());
  });
  app.post("/api/backup", { bodyLimit: 20 * 1024 * 1024, schema: { body: z.unknown() } }, async (request) => backup.import(backup.parse(request.body)));
}
