import { compileList } from "@listingwatch/shared/keyword-match";
import { DEFAULT_ACCENT_COLOUR, DEFAULT_SETTINGS, type Search } from "@listingwatch/shared/schemas";
import { describe, expect, it } from "vitest";
import { convertElectronSettings } from "../src/backup/electron-format.ts";
import { nextPollDelayMs, projectedDailyCalls } from "../src/domain/intervals.ts";
import { buildNotification, selectNotifiable } from "../src/domain/notify.ts";
import { planPoll, type PollInput } from "../src/domain/poll-pipeline.ts";
import { ebaySearch, foundListing } from "./helpers.ts";

const NOW = new Date("2026-11-11T12:30:00.000Z");

function input(overrides: Partial<PollInput>): PollInput {
  return {
    searchId: "s1",
    excludeKeywords: [],
    baselineDone: true,
    found: [],
    lists: [],
    seenIds: new Set(),
    onFeed: new Map(),
    backfillHours: 0,
    now: NOW,
    ...overrides,
  };
}

describe("planPoll", () => {
  it("adds only listings the search hasn't seen, and marks everything seen", () => {
    const plan = planPoll(input({ found: [foundListing({ itemId: "1" }), foundListing({ itemId: "2" })], seenIds: new Set(["1"]) }));
    expect(plan.added.map((l) => l.itemId)).toEqual(["2"]);
    expect(plan.added[0]).toMatchObject({ key: "ebay:2", searchIds: ["s1"], matchedTerms: [], foundAt: NOW.toISOString() });
    expect(plan.seen).toEqual(["1", "2"]);
    expect(plan.delivered).toEqual(["2"]);
  });

  it("marks filtered-out listings seen without adding them", () => {
    const lists = [compileList({ id: "l", version: 1, terms: ["zelda"] })];
    const plan = planPoll(
      input({
        found: [foundListing({ itemId: "1", title: "Zelda Ocarina" }), foundListing({ itemId: "2", title: "Mario Kart" }), foundListing({ itemId: "3", title: "Zelda broken" })],
        lists,
        excludeKeywords: ["broken"],
      }),
    );
    expect(plan.added.map((l) => l.itemId)).toEqual(["1"]);
    expect(plan.added[0]!.matchedTerms).toEqual(["zelda"]);
    expect(plan.seen).toEqual(["1", "2", "3"]);
  });

  it("on a baseline poll, surfaces only listings within the backfill window with a real date", () => {
    const plan = planPoll(
      input({
        baselineDone: false,
        backfillHours: 1,
        found: [
          foundListing({ itemId: "recent", listedAt: "2026-11-11T12:00:00.000Z" }),
          foundListing({ itemId: "old", listedAt: "2026-11-11T10:00:00.000Z" }),
          foundListing({ itemId: "guess", listedAt: NOW.toISOString(), listedAtEstimated: true }),
        ],
      }),
    );
    expect(plan.baseline).toBe(true);
    expect(plan.added.map((l) => l.itemId)).toEqual(["recent"]);
    expect(plan.seen).toHaveLength(3);
  });

  it("adds nothing on a baseline poll with no backfill", () => {
    expect(planPoll(input({ baselineDone: false, found: [foundListing({ itemId: "1" })] })).added).toEqual([]);
  });

  it("tags a listing another search already put on the feed instead of adding it twice", () => {
    const plan = planPoll(input({ found: [foundListing({ itemId: "1" })], onFeed: new Map([["ebay:1", ["other"]]]) }));
    expect(plan.added).toEqual([]);
    expect(plan.merged).toEqual([{ key: "ebay:1", searchIds: ["other", "s1"] }]);
    expect(plan.delivered).toEqual(["1"]);
  });

  it("ignores duplicate items within one page", () => {
    const plan = planPoll(input({ found: [foundListing({ itemId: "1" }), foundListing({ itemId: "1" })] }));
    expect(plan.added).toHaveLength(1);
  });
});

describe("poll intervals", () => {
  it("picks a delay within the range, doubling per failure up to 16×", () => {
    const search = { minInterval: 60, maxInterval: 120 };
    expect(nextPollDelayMs(search, 0, DEFAULT_SETTINGS, () => 0)).toBe(60_000);
    expect(nextPollDelayMs(search, 0, DEFAULT_SETTINGS, () => 1)).toBe(120_000);
    expect(nextPollDelayMs(search, 2, DEFAULT_SETTINGS, () => 0)).toBe(240_000);
    expect(nextPollDelayMs(search, 10, DEFAULT_SETTINGS, () => 0)).toBe(960_000);
  });

  it("falls back to the global range and never goes below 30 s", () => {
    expect(nextPollDelayMs({ minInterval: null, maxInterval: null }, 0, { ...DEFAULT_SETTINGS, minInterval: 30, maxInterval: 30 }, () => 0.5)).toBe(30_000);
  });

  it("projects daily calls from the midpoint of each range", () => {
    expect(projectedDailyCalls([{ minInterval: 60, maxInterval: 120 }], DEFAULT_SETTINGS)).toBe(960);
  });
});

describe("notifications", () => {
  const search = (overrides: Partial<Search>): Search =>
    ({ ...ebaySearch(), id: "s1", createdAt: "", updatedAt: "", status: {} as Search["status"], ...overrides }) as Search;
  const listing = (itemId: string, extra: Record<string, unknown> = {}) => ({
    ...foundListing({ itemId, title: `Item ${itemId}`, ...extra }),
    key: `ebay:${itemId}`,
    searchIds: ["s1"],
    matchedTerms: [],
    foundAt: NOW.toISOString(),
  });

  it("respects the search's switch, the wanted formats and the price ceiling", () => {
    const searches = new Map([["s1", search({ maxNotifyPrice: 50 })]]);
    const listings = [listing("cheap"), listing("dear", { price: { amount: 80, currency: "GBP" } }), listing("auction", { buyingFormats: ["Auction"] })];
    const settings = { ...DEFAULT_SETTINGS, notifyFormats: ["Buy It Now" as const] };
    expect(selectNotifiable(listings, searches, settings).map((l) => l.itemId)).toEqual(["cheap"]);
    expect(selectNotifiable(listings, new Map([["s1", search({ notify: false })]]), settings)).toEqual([]);
  });

  it("describes one listing with its price, and many with a count", () => {
    const searches = new Map([["s1", search({ name: "Switch" })]]);
    expect(buildNotification([listing("1")], searches)).toEqual({ title: "Switch", body: "Item 1 · £10.00", keys: ["ebay:1"] });
    const many = buildNotification(["1", "2", "3", "4", "5"].map((id) => listing(id)), searches)!;
    expect(many.title).toBe("5 new listings");
    expect(many.body.split("\n")).toEqual(["• Item 1", "• Item 2", "• Item 3", "…and 2 more"]);
  });
});

describe("Electron settings import", () => {
  it("keeps the current accent when the backup has the Electron default", () => {
    expect(convertElectronSettings({ accentColor: "#7D8EFC" }, DEFAULT_SETTINGS).accentColor).toBe(DEFAULT_ACCENT_COLOUR);
  });

  it("imports an accent the user chose", () => {
    expect(convertElectronSettings({ accentColor: "#ff0000" }, DEFAULT_SETTINGS).accentColor).toBe("#ff0000");
  });
});
