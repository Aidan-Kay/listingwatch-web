import { ListCompiler } from "@listingwatch/shared/keyword-match";
import type { AdapterRegistry } from "./marketplaces/types.ts";
import { BackupService } from "./backup/backup-service.ts";
import type { Config } from "./config.ts";
import { openDatabase } from "./db/database.ts";
import { nextPollDelayMs } from "./domain/intervals.ts";
import { EventBus } from "./events/event-bus.ts";
import { buildHttpApp } from "./http/app.ts";
import { SseHub } from "./http/sse-hub.ts";
import type { Logger } from "./logger.ts";
import { EbayAdapter } from "./marketplaces/ebay/adapter.ts";
import { EbayClient } from "./marketplaces/ebay/client.ts";
import { EbayTaxonomy } from "./marketplaces/ebay/taxonomy.ts";
import { VintedAdapter } from "./marketplaces/vinted/adapter.ts";
import { VintedBrowser } from "./marketplaces/vinted/browser.ts";
import { createHttpClient } from "./net/http-client.ts";
import { Notifier } from "./notifications/notifier.ts";
import { PresenceTracker } from "./notifications/presence.ts";
import { PushSender } from "./notifications/push-sender.ts";
import { Poller } from "./polling/poller.ts";
import { RequestGate } from "./polling/request-gate.ts";
import { Scheduler } from "./polling/scheduler.ts";
import { createRepositories } from "./repositories/index.ts";
import { FeedService } from "./services/feed-service.ts";
import { MatchListService } from "./services/match-list-service.ts";
import { PollingControl } from "./services/polling-control.ts";
import { SearchService } from "./services/search-service.ts";
import { readEbayCredentials, SettingsService } from "./services/settings-service.ts";
import { UsageTracker } from "./services/usage-tracker.ts";

export interface ContainerOverrides {
  /** Replace the marketplaces (tests use fakes). */
  adapters?: (defaults: { ebayClient: EbayClient }) => AdapterRegistry;
  databaseFile?: string;
  now?: () => Date;
}

/** Build every component of the server. Nothing starts until the caller listens and starts polling. */
export async function createContainer(config: Config, log: Logger, overrides: ContainerOverrides = {}) {
  const now = overrides.now ?? ((): Date => new Date());
  const db = openDatabase(overrides.databaseFile ?? config.paths.database);
  const repos = createRepositories(db);
  const events = new EventBus((error) => log.error({ err: error }, "A live-event listener failed"));
  const http = createHttpClient();
  const usage = new UsageTracker(repos, events, now);

  const ebayClient = new EbayClient({ http, credentials: () => readEbayCredentials(repos.secrets), onApiCall: () => usage.recordCall() });
  const vinted = new VintedAdapter(new VintedBrowser({ profileDir: config.paths.browserProfile, headless: config.vintedHeadless, log: log.child({ module: "vinted" }) }), log.child({ module: "vinted" }), now);
  const adapters = overrides.adapters?.({ ebayClient }) ?? { ebay: new EbayAdapter(ebayClient, log.child({ module: "ebay" }), now), vinted };

  const presence = new PresenceTracker();
  const push = new PushSender({ subscriptions: repos.pushSubscriptions, secrets: repos.secrets, appState: repos.appState, subject: config.vapidSubject, log });
  const notifier = new Notifier({ repos, push, presence, log });
  const lists = new ListCompiler();
  const gate = new RequestGate();
  const poller = new Poller({ db, repos, adapters, lists, gate, events, notifier, log: log.child({ module: "poller" }), now });
  const scheduler = new Scheduler({
    poll: (searchId, signal) => poller.poll(searchId, signal),
    delayAfter: (result) => nextPollDelayMs(result.search, result.search.status.consecutiveErrors, repos.settings.get()),
    enabledSearchIds: () => repos.searches.list().filter((s) => s.enabled).map((s) => s.id),
    onAllStopped: () => gate.reset(),
    log,
  });
  const polling = new PollingControl(scheduler, repos.appState, events);

  const searches = new SearchService({ db, repos, polling, events, adapters, lists, now });
  const settings = new SettingsService({ repos, events, http, ebay: ebayClient, vinted, uploadsDir: config.paths.uploads, log });
  const sse = new SseHub(events);
  const deps = {
    config,
    repos,
    searches,
    lists: new MatchListService({ db, repos, searches, compiler: lists, events, now }),
    feed: new FeedService(repos, events, now),
    settings,
    usage,
    polling,
    backup: new BackupService({ db, repos, scheduler, polling, events, now }),
    taxonomy: new EbayTaxonomy(ebayClient, repos.cache, now),
    adapters,
    sse,
    presence,
    push,
    now,
  };
  return { ...deps, db, scheduler, poller, events, notifier, http: await buildHttpApp(deps, log) };
}

export type Container = Awaited<ReturnType<typeof createContainer>>;
