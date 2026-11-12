import type { FastifyBaseLogger, FastifyInstance, FastifyReply, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerDefault } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { BackupService } from "../backup/backup-service.ts";
import type { Config } from "../config.ts";
import type { EbayTaxonomy } from "../marketplaces/ebay/taxonomy.ts";
import type { AdapterRegistry } from "../marketplaces/types.ts";
import type { PresenceTracker } from "../notifications/presence.ts";
import type { PushSender } from "../notifications/push-sender.ts";
import type { Repositories } from "../repositories/index.ts";
import type { FeedService } from "../services/feed-service.ts";
import type { MatchListService } from "../services/match-list-service.ts";
import type { PollingControl } from "../services/polling-control.ts";
import type { SearchService } from "../services/search-service.ts";
import type { SettingsService } from "../services/settings-service.ts";
import type { UsageTracker } from "../services/usage-tracker.ts";
import type { SseHub } from "./sse-hub.ts";

export type App = FastifyInstance<RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, FastifyBaseLogger, ZodTypeProvider>;

/** Everything the routes need. */
export interface HttpDeps {
  config: Config;
  repos: Repositories;
  searches: SearchService;
  lists: MatchListService;
  feed: FeedService;
  settings: SettingsService;
  usage: UsageTracker;
  polling: PollingControl;
  backup: BackupService;
  taxonomy: EbayTaxonomy;
  adapters: AdapterRegistry;
  sse: SseHub;
  presence: PresenceTracker;
  push: PushSender;
  now: () => Date;
}

/**
 * A signal that aborts when the client goes away before the response is sent,
 * or after `timeoutMs`, so a marketplace call nobody is waiting for stops.
 */
export function requestSignal(reply: FastifyReply, timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  reply.raw.on("close", () => {
    if (!reply.raw.writableFinished) controller.abort();
  });
  return AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)]);
}
