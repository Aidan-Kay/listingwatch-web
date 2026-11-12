import { randomUUID } from "node:crypto";
import type { ListCompiler } from "@listingwatch/shared/keyword-match";
import { searchConfigOf, type MatchList, type MatchListInput } from "@listingwatch/shared/schemas";
import type { Database } from "../db/database.ts";
import type { EventBus } from "../events/event-bus.ts";
import type { Repositories } from "../repositories/index.ts";
import { notFound } from "./errors.ts";
import type { SearchService } from "./search-service.ts";

/**
 * Match lists. Changing a list's terms (or deleting it) changes which
 * listings the searches using it keep, so those searches are re-baselined.
 */
export class MatchListService {
  private readonly db: Database;
  private readonly repos: Repositories;
  private readonly searches: SearchService;
  private readonly compiler: ListCompiler;
  private readonly events: EventBus;
  private readonly now: () => Date;

  constructor(deps: { db: Database; repos: Repositories; searches: SearchService; compiler: ListCompiler; events: EventBus; now: () => Date }) {
    this.db = deps.db;
    this.repos = deps.repos;
    this.searches = deps.searches;
    this.compiler = deps.compiler;
    this.events = deps.events;
    this.now = deps.now;
  }

  list(): MatchList[] {
    return this.repos.matchLists.list();
  }

  create(input: MatchListInput): MatchList {
    const list: MatchList = { id: randomUUID(), name: input.name, terms: input.terms, version: 1, updatedAt: this.now().toISOString() };
    this.repos.matchLists.upsert(list);
    this.events.publish({ type: "lists.changed" });
    return list;
  }

  update(id: string, input: MatchListInput): MatchList {
    const existing = this.repos.matchLists.get(id);
    if (!existing) throw notFound("Match list");
    const termsChanged = existing.terms.length !== input.terms.length || existing.terms.some((term, i) => term !== input.terms[i]);
    const list: MatchList = {
      ...existing,
      name: input.name,
      terms: input.terms,
      version: termsChanged ? existing.version + 1 : existing.version,
      updatedAt: this.now().toISOString(),
    };
    this.repos.matchLists.upsert(list);
    if (termsChanged) this.searches.rebaseline(this.searchesUsing(id));
    this.events.publish({ type: "lists.changed" });
    return list;
  }

  /** Delete a list and detach it from every search using it. */
  delete(id: string): void {
    if (!this.repos.matchLists.get(id)) throw notFound("Match list");
    const affected = this.searchesUsing(id);
    this.db.transaction(() => {
      for (const searchId of affected) {
        const config = searchConfigOf(this.repos.searches.get(searchId)!);
        this.repos.searches.updateConfig(searchId, { ...config, includeListIds: config.includeListIds.filter((l) => l !== id) }, this.now().toISOString());
      }
      this.repos.matchLists.delete(id);
    })();
    this.compiler.forget(id);
    this.searches.rebaseline(affected);
    this.events.publish({ type: "lists.changed" });
    if (affected.length > 0) this.events.publish({ type: "searches.changed" });
  }

  private searchesUsing(listId: string): string[] {
    return this.repos.searches
      .list()
      .filter((search) => search.includeListIds.includes(listId))
      .map((search) => search.id);
  }
}
