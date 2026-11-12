import { matchListSchema, searchInputSchema, settingsSchema, type ImportResult, type MatchList, type Settings } from "@listingwatch/shared/schemas";
import { z } from "zod";
import type { Database } from "../db/database.ts";
import type { EventBus } from "../events/event-bus.ts";
import type { Repositories } from "../repositories/index.ts";
import { badRequest } from "../services/errors.ts";
import type { PollingControl } from "../services/polling-control.ts";
import type { Scheduler } from "../polling/scheduler.ts";
import {
  convertElectronFavourite,
  convertElectronMatchList,
  convertElectronSearch,
  convertElectronSettings,
  type ConvertedSearch,
} from "./electron-format.ts";

export const BACKUP_FORMAT = "listingwatch-backup";
export const BACKUP_VERSION = 3;

const backupV3Schema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string(),
  searches: z.array(z.looseObject({ id: z.string().min(1) })),
  matchLists: z.array(matchListSchema),
  settings: settingsSchema,
});

export interface BackupContents {
  searches: ConvertedSearch[];
  matchLists: MatchList[];
  settings: Settings | null;
  favourites: ReturnType<typeof convertElectronFavourite>[];
}

/**
 * Export searches, match lists and settings (never credentials), and import
 * them back: from this app's exports, or from the Electron app's v1/v2
 * backups and data files.
 */
export class BackupService {
  private readonly db: Database;
  private readonly repos: Repositories;
  private readonly scheduler: Scheduler;
  private readonly polling: PollingControl;
  private readonly events: EventBus;
  private readonly now: () => Date;

  constructor(deps: { db: Database; repos: Repositories; scheduler: Scheduler; polling: PollingControl; events: EventBus; now: () => Date }) {
    this.db = deps.db;
    this.repos = deps.repos;
    this.scheduler = deps.scheduler;
    this.polling = deps.polling;
    this.events = deps.events;
    this.now = deps.now;
  }

  export(): unknown {
    const settings = this.repos.settings.get();
    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: this.now().toISOString(),
      searches: this.repos.searches.list().map(({ createdAt: _c, updatedAt: _u, status: _s, ...search }) => search),
      matchLists: this.repos.matchLists.list(),
      settings: { ...settings, sound: { ...settings.sound, customName: null } },
    };
  }

  /** Parse any supported backup into this app's shapes. */
  parse(raw: unknown): BackupContents {
    const v3 = backupV3Schema.safeParse(raw);
    if (v3.success) {
      const searches = v3.data.searches.map((search) => {
        const config = searchInputSchema.safeParse(search);
        if (!config.success) throw badRequest(`Search "${String((search as { name?: unknown }).name)}" is invalid: ${config.error.issues[0]?.message}`);
        return { id: search.id, config: config.data };
      });
      return { searches, matchLists: v3.data.matchLists, settings: v3.data.settings, favourites: [] };
    }
    return this.parseElectron(raw);
  }

  private parseElectron(raw: unknown): BackupContents {
    const data = raw as { searches?: unknown; keywordLists?: unknown; settings?: unknown; favourites?: unknown };
    if (typeof raw !== "object" || raw === null || !Array.isArray(data.searches)) {
      throw badRequest("That isn't a ListingWatch backup");
    }
    const searches: ConvertedSearch[] = [];
    for (const item of data.searches) {
      const converted = convertElectronSearch(item);
      if ("error" in converted) throw badRequest(`Couldn't import ${converted.error}`);
      searches.push(converted);
    }
    const now = this.now().toISOString();
    const matchLists = Array.isArray(data.keywordLists)
      ? data.keywordLists.map((l) => convertElectronMatchList(l, now)).filter((l): l is MatchList => l !== null)
      : [];
    const settings = data.settings === undefined ? null : convertElectronSettings(data.settings, this.repos.settings.get());
    const favourites = Array.isArray(data.favourites) ? data.favourites.map(convertElectronFavourite).filter((f) => f !== null) : [];
    return { searches, matchLists, settings, favourites };
  }

  /**
   * Replace searches and match lists with the backup's, and adopt its settings.
   * Every imported search starts with a fresh baseline. Polling restarts after.
   */
  import(parsed: BackupContents): ImportResult {
    const contents = withoutDanglingLists(parsed, this.repos.matchLists.list());
    this.scheduler.stopAll();
    this.db.transaction(() => this.replaceAll(contents))();
    this.polling.startUp();
    for (const type of ["searches.changed", "lists.changed", "settings.changed", "favourites.changed"] as const) this.events.publish({ type });
    this.events.publish({ type: "feed.cleared" });
    return {
      searches: contents.searches.length,
      matchLists: contents.matchLists.length,
      favourites: contents.favourites.length,
      settingsImported: contents.settings !== null,
    };
  }

  private replaceAll(contents: BackupContents): void {
    const now = this.now().toISOString();
    const keep = new Set(contents.searches.map((s) => s.id));
    for (const existing of this.repos.searches.list()) {
      if (!keep.has(existing.id)) this.repos.searches.delete(existing.id);
    }
    this.repos.listings.clear();
    for (const { id, config } of contents.searches) {
      if (this.repos.searches.get(id)) {
        this.repos.searches.updateConfig(id, config, now);
        this.repos.searchItems.forgetUndelivered(id);
        this.repos.searches.clearBaseline(id);
      } else {
        this.repos.searches.insert(id, config, now);
      }
    }
    if (contents.matchLists.length > 0) {
      for (const list of this.repos.matchLists.list()) this.repos.matchLists.delete(list.id);
      for (const list of contents.matchLists) this.repos.matchLists.upsert(list);
    }
    if (contents.settings) this.repos.settings.save({ ...contents.settings, sound: this.repos.settings.get().sound });
    for (const favourite of contents.favourites) {
      if (favourite) this.repos.favourites.put(favourite.listing, favourite.savedAt);
    }
  }
}

/**
 * Old backups may reference match lists they don't include. Keep references to
 * lists that will exist after the import and drop the rest, rather than leave
 * searches pointing at nothing.
 */
function withoutDanglingLists(contents: BackupContents, existing: readonly MatchList[]): BackupContents {
  const available = new Set((contents.matchLists.length > 0 ? contents.matchLists : existing).map((list) => list.id));
  return {
    ...contents,
    searches: contents.searches.map(({ id, config }) => ({ id, config: { ...config, includeListIds: config.includeListIds.filter((l) => available.has(l)) } })),
  };
}
