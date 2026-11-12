import { loadConfig } from "./config.ts";
import { createContainer } from "./container.ts";
import { createLogger, type Logger } from "./logger.ts";

/** Composition root: build every component, start serving and polling, and stop cleanly. */
async function main(): Promise<void> {
  const config = loadConfig();
  const log = createLogger({ level: config.logLevel, logDir: config.paths.logs, pretty: process.stdout.isTTY });
  reportCrashes(log);
  log.info({ revision: config.revision, port: config.port, host: config.host, data: config.paths.data }, "Starting ListingWatch");

  const app = await createContainer(config, log);
  await app.settings.applyProxy();
  await app.http.listen({ port: config.port, host: config.host });
  app.polling.startUp();
  log.info({ paused: app.polling.paused }, "Polling started");

  let stopping = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    log.info({ signal }, "Shutting down");
    app.scheduler.stopAll();
    app.sse.close();
    await app.http.close();
    await Promise.all([app.adapters.ebay.close(), app.adapters.vinted.close()]);
    app.db.close();
    log.flush();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

/** Log anything that escapes, then exit so the supervisor restarts a clean process. */
function reportCrashes(log: Logger): void {
  process.on("uncaughtException", (error) => {
    log.fatal({ err: error }, "Uncaught exception");
    log.flush();
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => log.error({ err: reason }, "Unhandled promise rejection"));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
