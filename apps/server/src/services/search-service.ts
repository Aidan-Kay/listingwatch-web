import { randomUUID } from "node:crypto";
import type { ListCompiler } from "@listingwatch/shared/keyword-match";
import { searchConfigOf, type Search, type SearchInput, type TestSearchResult } from "@listingwatch/shared/schemas";
import type { Database } from "../db/database.ts";
import { applyClientFilters } from "../domain/client-filters.ts";
import type { EventBus } from "../events/event-bus.ts";
import type { AdapterRegistry } from "../marketplaces/types.ts";
import type { Repositories } from "../repositories/index.ts";
import { badRequest, notFound } from "./errors.ts";
import type { PollingControl } from "./polling-control.ts";

export interface SearchServiceDeps {
  db: Database;
  repos: Repositories;
  polling: PollingControl;
  events: EventBus;
  adapters: AdapterRegistry;
  lists: ListCompiler;
  now: () => Date;
}

/** Saved searches: lifecycle, and keeping their poll loops and stored state consistent. */
export class SearchService {
  private readonly deps: SearchServiceDeps;

  constructor(deps: SearchServiceDeps) {
    this.deps = deps;
  }

  list(): Search[] {
    return this.deps.repos.searches.list();
  }

  get(id: string): Search {
    const search = this.deps.repos.searches.get(id);
    if (!search) throw notFound("Search");
    return search;
  }

  create(config: SearchInput): Search {
    const search = this.deps.repos.searches.insert(randomUUID(), config, this.nowIso());
    this.deps.polling.sync(search.id, search.enabled);
    this.deps.events.publish({ type: "searches.changed" });
    return search;
  }

  /**
   * Replace a search's configuration. Changing a client-side filter (match
   * lists or excluded words) re-baselines it: listings it fetched but filtered
   * out may now qualify, and must be reconsidered without being announced as a
   * flood of "new" ones.
   */
  update(id: string, config: SearchInput): Search {
    const previous = searchConfigOf(this.get(id));
    if (previous.source !== config.source) throw badRequest("A search can't change marketplace; create a new search instead");
    this.deps.db.transaction(() => {
      this.deps.repos.searches.updateConfig(id, config, this.nowIso());
      if (clientFiltersChanged(previous, config)) this.rebaselineNow(id);
    })();
    if (affectsPolling(previous, config)) this.deps.polling.sync(id, config.enabled);
    this.deps.events.publish({ type: "searches.changed" });
    return this.get(id);
  }

  setFlags(id: string, flags: { enabled?: boolean | undefined; notify?: boolean | undefined }): Search {
    const config = { ...searchConfigOf(this.get(id)) };
    if (flags.enabled !== undefined) config.enabled = flags.enabled;
    if (flags.notify !== undefined) config.notify = flags.notify;
    return this.update(id, config);
  }

  /** A paused copy, so it can be adjusted before it starts polling. */
  duplicate(id: string): Search {
    const source = searchConfigOf(this.get(id));
    return this.create({ ...source, name: `${source.name} (copy)`, enabled: false });
  }

  /** Delete a search; its listings leave the feed unless another search found them too. */
  delete(id: string): void {
    this.get(id);
    this.deps.polling.sync(id, false);
    const { removed, retagged } = this.deps.db.transaction(() => {
      const changes = this.deps.repos.listings.removeSearch(id);
      this.deps.repos.searches.delete(id);
      return changes;
    })();
    if (removed.length > 0) this.deps.events.publish({ type: "listings.removed", keys: removed });
    for (const change of retagged) this.deps.events.publish({ type: "listings.merged", ...change });
    this.deps.events.publish({ type: "searches.changed" });
  }

  /** Re-baseline searches (after a match list they use changed) and restart their loops. */
  rebaseline(ids: readonly string[]): void {
    this.deps.db.transaction(() => ids.forEach((id) => this.rebaselineNow(id)))();
    for (const id of ids) {
      const search = this.deps.repos.searches.get(id);
      if (search) this.deps.polling.sync(id, search.enabled);
    }
  }

  /** Run a search once without saving anything, showing what each client-side filter would drop. */
  async test(config: SearchInput, signal: AbortSignal): Promise<TestSearchResult> {
    const found = await this.deps.adapters[config.source].search(config, signal);
    const lists = this.deps.lists.compileAll(config.includeListIds, this.deps.repos.matchLists.list());
    return applyClientFilters(found, lists, config.excludeKeywords);
  }

  private rebaselineNow(id: string): void {
    this.deps.repos.searchItems.forgetUndelivered(id);
    this.deps.repos.searches.clearBaseline(id);
  }

  private nowIso(): string {
    return this.deps.now().toISOString();
  }
}

function clientFiltersChanged(previous: SearchInput, next: SearchInput): boolean {
  return !sameItems(previous.includeListIds, next.includeListIds) || !sameItems(previous.excludeKeywords, next.excludeKeywords);
}

/** Fields that only change presentation or notification; editing them needn't restart polling. */
const PRESENTATION_FIELDS = new Set(["name", "notify", "color", "maxNotifyPrice"]);

function affectsPolling(previous: SearchInput, next: SearchInput): boolean {
  const pollingFields = (config: SearchInput): string =>
    JSON.stringify(
      Object.entries(config)
        .filter(([key]) => !PRESENTATION_FIELDS.has(key))
        .sort(([a], [b]) => a.localeCompare(b)),
    );
  return pollingFields(previous) !== pollingFields(next);
}

function sameItems(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedB = [...b].sort();
  return [...a].sort().every((value, i) => value === sortedB[i]);
}
