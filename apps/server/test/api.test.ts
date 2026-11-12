import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FoundListing, LiveEvent, Search, SearchInput } from "@listingwatch/shared/schemas";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";
import { createContainer, type Container } from "../src/container.ts";
import type { MarketplaceAdapter } from "../src/marketplaces/types.ts";
import { ebaySearch, foundListing, silentLog } from "./helpers.ts";

/** A marketplace whose next answer the test decides. */
class FakeMarketplace implements MarketplaceAdapter {
  readonly source: "ebay" | "vinted";
  results: FoundListing[] = [];
  failure: Error | null = null;

  constructor(source: "ebay" | "vinted") {
    this.source = source;
  }

  async search(): Promise<FoundListing[]> {
    if (this.failure) throw this.failure;
    return this.results;
  }

  async itemImages(): Promise<string[]> {
    return ["https://i.ebayimg.com/a/s-l1600.jpg"];
  }

  async close(): Promise<void> {}
}

let app: Container;
let ebay: FakeMarketplace;
let events: LiveEvent[];
let dataDir: string;
const clock = { now: new Date("2026-11-11T12:00:00.000Z") };

beforeEach(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "listingwatch-test-"));
  const config = loadConfig({ HOST: "127.0.0.1", DATA_DIR: dataDir, WEB_DIST_DIR: path.join(dataDir, "no-web") });
  ebay = new FakeMarketplace("ebay");
  app = await createContainer(config, silentLog, {
    databaseFile: ":memory:",
    adapters: () => ({ ebay, vinted: new FakeMarketplace("vinted") }),
    now: () => clock.now,
  });
  events = [];
  app.events.subscribe((event) => events.push(event));
});

afterEach(async () => {
  app.scheduler.stopAll();
  await app.http.close();
  app.db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function request<T = unknown>(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: unknown): Promise<{ status: number; body: T }> {
  const response = await app.http.inject({ method, url, ...(payload === undefined ? {} : { payload: payload as object }) });
  return { status: response.statusCode, body: (response.body === "" ? null : response.json()) as T };
}

async function createSearch(overrides: Partial<SearchInput> = {}): Promise<Search> {
  const { status, body } = await request<Search>("POST", "/api/searches", { ...ebaySearch(), enabled: false, ...overrides });
  expect(status).toBe(201);
  return body;
}

/** Run one poll the way the scheduler would. */
async function poll(search: Search): Promise<void> {
  await app.repos.searches.updateConfig(search.id, { ...app.searches.get(search.id), enabled: true } as SearchInput, clock.now.toISOString());
  await app.poller.poll(search.id, new AbortController().signal);
}

const feedKeys = async (): Promise<string[]> => (await request<{ listings: { key: string }[] }>("GET", "/api/feed")).body.listings.map((l) => l.key);

describe("searches", () => {
  it("validates input and reports field problems", async () => {
    const { status, body } = await request<{ error: { code: string; issues: { path: string }[] } }>("POST", "/api/searches", { source: "ebay", site: "UK", name: "" });
    expect(status).toBe(400);
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.issues[0]!.path).toBe("name");
  });

  it("creates, lists, edits, duplicates and deletes", async () => {
    const search = await createSearch();
    expect((await request<Search[]>("GET", "/api/searches")).body.map((s) => s.name)).toEqual(["Switch"]);
    const edited = await request<Search>("PUT", `/api/searches/${search.id}`, { ...ebaySearch(), name: "Switch OLED", enabled: false });
    expect(edited.body.name).toBe("Switch OLED");
    const copy = await request<Search>("POST", `/api/searches/${search.id}/duplicate`);
    expect(copy.body).toMatchObject({ name: "Switch OLED (copy)", enabled: false });
    expect((await request("DELETE", `/api/searches/${search.id}`)).status).toBe(204);
    expect((await request("GET", `/api/searches`)).body).toHaveLength(1);
    expect((await request("DELETE", `/api/searches/${search.id}`)).status).toBe(404);
  });

  it("refuses to change a search's marketplace", async () => {
    const search = await createSearch();
    const { status } = await request("PUT", `/api/searches/${search.id}`, { source: "vinted", site: "UK", name: "x" });
    expect(status).toBe(400);
  });
});

describe("polling", () => {
  it("records a baseline first, then adds and notifies only new listings", async () => {
    const search = await createSearch();
    ebay.results = [foundListing({ itemId: "1", listedAt: "2026-11-10T00:00:00.000Z" })];
    await poll(search);
    expect(await feedKeys()).toEqual([]);
    expect(app.searches.get(search.id).status).toMatchObject({ baselineDone: true, lastError: null });

    ebay.results = [foundListing({ itemId: "2" }), foundListing({ itemId: "1" })];
    await poll(search);
    expect(await feedKeys()).toEqual(["ebay:2"]);
    const added = events.find((e) => e.type === "listings.added");
    expect(added).toMatchObject({ notifiable: ["ebay:2"] });
  });

  it("backfills recent listings on the baseline poll", async () => {
    await request("PUT", "/api/settings", { ...(await request<{ settings: object }>("GET", "/api/settings")).body.settings, backfillHours: 24 });
    const search = await createSearch();
    ebay.results = [foundListing({ itemId: "recent", listedAt: "2026-11-11T11:00:00.000Z" }), foundListing({ itemId: "old", listedAt: "2026-11-01T00:00:00.000Z" })];
    await poll(search);
    expect(await feedKeys()).toEqual(["ebay:recent"]);
  });

  it("shows a listing found by two searches once, tagged with both", async () => {
    const [first, second] = [await createSearch({ name: "A" }), await createSearch({ name: "B" })];
    for (const search of [first, second]) {
      ebay.results = [];
      await poll(search);
    }
    ebay.results = [foundListing({ itemId: "9" })];
    await poll(first);
    await poll(second);
    const { body } = await request<{ listings: { searchIds: string[] }[] }>("GET", "/api/feed");
    expect(body.listings).toHaveLength(1);
    expect(body.listings[0]!.searchIds).toEqual([first.id, second.id]);

    await request("DELETE", `/api/searches/${first.id}`);
    expect((await request<{ listings: { searchIds: string[] }[] }>("GET", "/api/feed")).body.listings[0]!.searchIds).toEqual([second.id]);
    await request("DELETE", `/api/searches/${second.id}`);
    expect(await feedKeys()).toEqual([]);
  });

  it("reconsiders filtered listings after a filter change, without re-showing delivered ones", async () => {
    await request("PUT", "/api/settings", { ...(await request<{ settings: object }>("GET", "/api/settings")).body.settings, backfillHours: 0 });
    const search = await createSearch({ excludeKeywords: ["broken"] });
    ebay.results = [];
    await poll(search);
    ebay.results = [foundListing({ itemId: "1", title: "Switch broken" }), foundListing({ itemId: "2", title: "Switch boxed" })];
    await poll(search);
    expect(await feedKeys()).toEqual(["ebay:2"]);
    await request("DELETE", "/api/feed/ebay%3A2");

    await request("PUT", `/api/searches/${search.id}`, { ...ebaySearch(), enabled: false, excludeKeywords: [] });
    expect(app.searches.get(search.id).status.baselineDone).toBe(false);
    await poll(search); // baseline again: nothing announced
    ebay.results = [foundListing({ itemId: "3" }), ...ebay.results];
    await poll(search);
    expect(await feedKeys()).toEqual(["ebay:3"]);
  });

  it("records failures with their kind and keeps backoff off for offline errors", async () => {
    const search = await createSearch();
    ebay.failure = Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("dns"), { code: "ENOTFOUND" }) });
    await poll(search);
    expect(app.searches.get(search.id).status).toMatchObject({ consecutiveErrors: 0, lastError: { kind: "offline" } });
    ebay.failure = new Error("boom");
    await poll(search);
    expect(app.searches.get(search.id).status).toMatchObject({ consecutiveErrors: 1, lastError: { kind: "unknown", message: "boom" } });
  });

  it("tests a search without saving, showing what the filters drop", async () => {
    await request("POST", "/api/lists", { name: "Zelda", terms: ["zelda"] });
    const listId = (await request<{ id: string }[]>("GET", "/api/lists")).body[0]!.id;
    ebay.results = [foundListing({ itemId: "1", title: "Zelda" }), foundListing({ itemId: "2", title: "Mario" }), foundListing({ itemId: "3", title: "Zelda faulty" })];
    const { body } = await request<{ kept: { itemId: string; matchedTerms: string[] }[]; rejectedByMatchLists: unknown[]; rejectedByExcludes: unknown[] }>(
      "POST",
      "/api/searches/test",
      { ...ebaySearch(), includeListIds: [listId], excludeKeywords: ["faulty"] },
    );
    expect(body.kept).toMatchObject([{ itemId: "1", matchedTerms: ["zelda"] }]);
    expect(body.rejectedByMatchLists).toHaveLength(1);
    expect(body.rejectedByExcludes).toHaveLength(1);
    expect(app.searches.list()).toHaveLength(0);
  });
});

describe("match lists", () => {
  it("re-baselines searches when a list's terms change, and detaches deleted lists", async () => {
    const list = (await request<{ id: string }>("POST", "/api/lists", { name: "Games", terms: ["zelda", "Zelda", " "] })).body;
    expect((await request<{ terms: string[] }[]>("GET", "/api/lists")).body[0]!.terms).toEqual(["zelda"]);
    const search = await createSearch({ includeListIds: [list.id] });
    await poll(search);
    expect(app.searches.get(search.id).status.baselineDone).toBe(true);

    await request("PUT", `/api/lists/${list.id}`, { name: "Games", terms: ["zelda", "mario"] });
    expect(app.searches.get(search.id).status.baselineDone).toBe(false);

    await request("DELETE", `/api/lists/${list.id}`);
    expect(app.searches.get(search.id).includeListIds).toEqual([]);
  });
});

describe("feed and favourites", () => {
  it("favourites a feed listing, tracks the unseen boundary and clears with events", async () => {
    const search = await createSearch();
    await poll(search);
    ebay.results = [foundListing({ itemId: "5" })];
    await poll(search);
    expect((await request("PUT", "/api/favourites/ebay%3A5")).status).toBe(204);
    expect((await request<{ listing: { key: string } }[]>("GET", "/api/favourites")).body.map((f) => f.listing.key)).toEqual(["ebay:5"]);
    expect((await request<{ seenAt: string }>("POST", "/api/feed/seen")).body.seenAt).toBe(clock.now.toISOString());
    await request("DELETE", "/api/feed");
    expect(await feedKeys()).toEqual([]);
    expect((await request("GET", "/api/favourites")).body).toHaveLength(1);
    expect(events.map((e) => e.type)).toContain("feed.cleared");
  });

  it("rejects malformed listing keys", async () => {
    expect((await request("PUT", "/api/favourites/nonsense")).status).toBe(400);
  });
});

describe("settings", () => {
  it("never returns eBay credentials, only whether they're set", async () => {
    const view = await request<Record<string, unknown>>("PUT", "/api/settings/ebay-credentials", { clientId: "MyName-App-PRD-123456", clientSecret: "PRD-secret" });
    expect(JSON.stringify(view.body)).not.toContain("PRD-secret");
    expect(view.body.ebayCredentials).toEqual({ configured: true, clientIdHint: "MyName-App-P…" });
  });

  it("validates settings", async () => {
    const { body } = await request<{ settings: Record<string, unknown> }>("GET", "/api/settings");
    expect((await request("PUT", "/api/settings", { ...body.settings, minInterval: 5 })).status).toBe(400);
    expect((await request("PUT", "/api/settings", { ...body.settings, proxy: { enabled: true, url: "" } })).status).toBe(400);
  });
});

describe("backup", () => {
  it("round-trips its own export", async () => {
    const list = (await request<{ id: string }>("POST", "/api/lists", { name: "Games", terms: ["zelda"] })).body;
    await createSearch({ name: "Kept", includeListIds: [list.id] });
    const exported = (await request<Record<string, unknown>>("GET", "/api/backup")).body;
    await request("DELETE", `/api/lists/${list.id}`);
    const result = await request("POST", "/api/backup", exported);
    expect(result.body).toMatchObject({ searches: 1, matchLists: 1 });
    expect(app.searches.list()[0]!.includeListIds).toEqual([list.id]);
  });

  it("imports an Electron backup", async () => {
    const result = await request("POST", "/api/backup", {
      version: 2,
      searches: [
        { id: "search_1", name: "PS2", source: "ebay", site: "UK", keywords: "ps2", minPrice: "5", aspectFilters: [{ name: "Platform", values: "Sony, PS2" }], includeLists: ["list_1"], cardColor: "#ff0000" },
        { id: "search_2", name: "GC", source: "vinted", site: "FR", vintedCategory: "3026", vintedConditions: ["6", "99"], vintedFilters: [{ name: "video_game_platform_ids[]", values: "1281,1282" }] },
      ],
      keywordLists: [{ id: "list_1", name: "Games", terms: ["zelda"], version: 3 }],
      settings: { minInterval: 60, maxInterval: 180, feedZoom: "large", showListingsFromHours: 6, clientId: "should-not-import" },
    });
    expect(result.status).toBe(200);
    const [ps2, gc] = app.searches.list();
    expect(ps2).toMatchObject({ name: "PS2", minPrice: 5, color: "#ff0000", includeListIds: ["list_1"], filters: [{ name: "Platform", values: ["Sony", "PS2"] }] });
    expect(gc).toMatchObject({ source: "vinted", site: "FR", category: "3026", conditions: ["6"], filters: [{ name: "video_game_platform_ids[]", values: ["1281", "1282"] }] });
    expect(app.repos.settings.get()).toMatchObject({ minInterval: 60, maxInterval: 180, backfillHours: 6 });
    expect(app.settings.ebayCredentials()).toBeNull();
  });

  it("rejects files that aren't backups", async () => {
    expect((await request("POST", "/api/backup", { hello: "world" })).status).toBe(400);
  });
});

describe("images and health", () => {
  it("fetches item images and reports health", async () => {
    expect((await request("GET", "/api/listings/ebay/123/images?site=UK")).body).toEqual({ images: ["https://i.ebayimg.com/a/s-l1600.jpg"] });
    expect((await request("GET", "/api/health")).body).toMatchObject({ ok: true, revision: "local" });
  });
});

describe("serving the web app", () => {
  it("serves files, falls back to the app for page routes, and 404s missing assets", async () => {
    const webDir = path.join(dataDir, "web");
    fs.mkdirSync(path.join(webDir, "assets"), { recursive: true });
    fs.writeFileSync(path.join(webDir, "index.html"), "<!doctype html><title>app</title>");
    fs.writeFileSync(path.join(webDir, "assets", "app-1.js"), "console.log(1)");
    const config = loadConfig({ HOST: "127.0.0.1", DATA_DIR: dataDir, WEB_DIST_DIR: webDir });
    const web = await createContainer(config, silentLog, { databaseFile: ":memory:", adapters: () => ({ ebay, vinted: new FakeMarketplace("vinted") }) });
    try {
      const page = await web.http.inject({ url: "/searches?new=1" });
      expect(page.statusCode).toBe(200);
      expect(page.headers["content-type"]).toContain("text/html");
      expect(page.headers["content-security-policy"]).toContain("default-src 'self'");
      expect((await web.http.inject({ url: "/assets/app-1.js" })).headers["cache-control"]).toContain("immutable");
      expect((await web.http.inject({ url: "/assets/app-old.js" })).statusCode).toBe(404);
      expect((await web.http.inject({ url: "/api/nope" })).statusCode).toBe(404);
    } finally {
      await web.http.close();
      web.db.close();
    }
  });
});
