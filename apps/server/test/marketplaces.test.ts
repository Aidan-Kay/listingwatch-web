import type { EbaySearchInput, VintedSearchInput } from "@listingwatch/shared/schemas";
import { describe, expect, it } from "vitest";
import { MarketplaceError, toMarketplaceError } from "../src/marketplaces/errors.ts";
import { flattenCategoryTree } from "../src/marketplaces/ebay/taxonomy.ts";
import { buildSearchUrl, mapItemSummary, numericItemId } from "../src/marketplaces/ebay/search.ts";
import { attributeName, buildCatalogueUrl, mapCatalogueItem } from "../src/marketplaces/vinted/catalogue.ts";
import { parseCatalogueResponse } from "../src/marketplaces/vinted/response.ts";
import { ebaySearch, vintedSearch } from "./helpers.ts";

const NOW = new Date("2026-11-11T12:00:00.000Z");

describe("eBay search URL", () => {
  it("applies every filter", () => {
    const url = new URL(
      buildSearchUrl(
        ebaySearch({
          category: "139973",
          minPrice: 5,
          maxPrice: 100,
          format: "auction",
          itemLocation: "GB",
          conditions: ["USED", "1000"],
          filters: [{ name: "Platform", values: ["Sony PlayStation 2", "Xbox"] }],
        }) as EbaySearchInput,
      ),
    );
    expect(url.searchParams.get("q")).toBe("nintendo switch");
    expect(url.searchParams.get("category_ids")).toBe("139973");
    expect(url.searchParams.get("sort")).toBe("newlyListed");
    expect(url.searchParams.get("filter")).toBe(
      "price:[5..100],priceCurrency:GBP,buyingOptions:{AUCTION},itemLocationCountry:GB,conditionIds:{3000|1000}",
    );
    expect(url.searchParams.get("aspect_filter")).toBe("categoryId:139973,Platform:{Sony PlayStation 2|Xbox}");
  });

  it("leaves out aspects without a category, and open-ended prices", () => {
    const url = new URL(buildSearchUrl(ebaySearch({ maxPrice: 20, filters: [{ name: "Platform", values: ["x"] }] }) as EbaySearchInput));
    expect(url.searchParams.get("aspect_filter")).toBeNull();
    expect(url.searchParams.get("filter")).toContain("price:[..20]");
  });
});

describe("eBay item mapping", () => {
  it("maps an auction with shipping and images", () => {
    const listing = mapItemSummary(
      {
        itemId: "v1|123456|0",
        title: "Switch OLED",
        price: { value: "200.00", currency: "GBP" },
        currentBidPrice: { value: "150.50", currency: "GBP" },
        shippingOptions: [{ shippingCost: { value: "0.00", currency: "GBP" } }],
        image: { imageUrl: "https://i.ebayimg.com/images/g/x/s-l225.jpg" },
        additionalImages: [{ imageUrl: "https://i.ebayimg.com/images/g/y/s-l225.jpg" }],
        buyingOptions: ["AUCTION", "BEST_OFFER"],
        bidCount: 3,
        itemCreationDate: "2026-11-11T11:00:00.000Z",
        itemEndDate: "2026-11-18T11:00:00.000Z",
      },
      "UK",
      NOW,
    );
    expect(listing).toMatchObject({
      itemId: "123456",
      url: "https://www.ebay.co.uk/itm/123456",
      price: { amount: 150.5, currency: "GBP" },
      priceIsBid: true,
      shipping: { amount: 0, currency: "GBP" },
      imageUrl: "https://i.ebayimg.com/images/g/x/s-l400.jpg",
      imageUrls: ["https://i.ebayimg.com/images/g/x/s-l1600.jpg", "https://i.ebayimg.com/images/g/y/s-l1600.jpg"],
      buyingFormats: ["Auction", "Best Offer"],
      bidCount: 3,
      listedAtEstimated: false,
      endsAt: "2026-11-18T11:00:00.000Z",
    });
  });

  it("rejects items without an ID or title, and estimates a missing date", () => {
    expect(mapItemSummary({ title: "x" }, "UK", NOW)).toBeNull();
    expect(mapItemSummary({ itemId: "v1|1|0", title: "x" }, "UK", NOW)).toMatchObject({ listedAt: NOW.toISOString(), listedAtEstimated: true, buyingFormats: ["Other"] });
    expect(numericItemId("v1|987|0")).toBe("987");
  });

  it("flattens the category tree, skipping the root", () => {
    const rows = flattenCategoryTree({
      childCategoryTreeNodes: [
        { category: { categoryId: "1", categoryName: "Toys" }, childCategoryTreeNodes: [{ category: { categoryId: "2", categoryName: "Corgi" }, leafCategoryTreeNode: true }] },
      ],
    });
    expect(rows).toEqual([
      { id: "1", name: "Toys", depth: 1, parentId: null, leaf: false },
      { id: "2", name: "Corgi", depth: 2, parentId: "1", leaf: true },
    ]);
  });
});

describe("Vinted catalogue", () => {
  it("builds the API URL, merging facets for the same attribute", () => {
    const url = new URL(
      buildCatalogueUrl(
        vintedSearch({
          category: "3026",
          conditions: ["6", "99"],
          minPrice: 5,
          filters: [
            { name: "catalog", values: ["1234"] },
            { name: "video_game_platform_ids[]", values: ["1281", "1282"] },
          ],
        }) as VintedSearchInput,
      ),
    );
    expect(url.host).toBe("api.vinted.co.uk");
    expect(url.pathname).toBe("/svc-catalogue/items");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: "1",
      per_page: "50",
      order: "newest_first",
      search_text: "gamecube",
      price_from: "5",
      "attribute_ids[catalog]": "3026,1234",
      "attribute_ids[status]": "6",
      "attribute_ids[video_game_platform]": "1281,1282",
    });
  });

  it("normalises attribute names idempotently", () => {
    expect(attributeName("video_game_platform_ids[]")).toBe("video_game_platform");
    expect(attributeName(attributeName("brand_ids[]"))).toBe("brand");
  });

  it("ignores a brand line that just repeats the title (unbranded items)", () => {
    expect(mapCatalogueItem({ id: 1, title: "Puddles Amiibo Coin", item_box: { first_line: "Puddles Amiibo Coin" } }, "UK", NOW)?.brand).toBeNull();
  });

  it("maps an item, resolving its relative URL and estimating its date", () => {
    expect(
      mapCatalogueItem(
        {
          id: 42,
          title: "GameCube console",
          url: "/items/42-gamecube",
          price: { amount: "55.0", currency_code: "GBP" },
          photo: { url: "https://images1.vinted.net/t/a.jpg" },
          photos: [{ full_size_url: "https://images1.vinted.net/f/a.jpg" }],
          item_box: { first_line: "Nintendo", second_line: "Very good" },
        },
        "UK",
        NOW,
      ),
    ).toMatchObject({
      itemId: "42",
      url: "https://www.vinted.co.uk/items/42-gamecube",
      price: { amount: 55, currency: "GBP" },
      brand: "Nintendo",
      condition: "Very good",
      imageUrl: "https://images1.vinted.net/t/a.jpg",
      imageUrls: ["https://images1.vinted.net/f/a.jpg"],
      listedAt: NOW.toISOString(),
      listedAtEstimated: true,
    });
  });
});

describe("Vinted response classification", () => {
  const kindOf = (raw: Parameters<typeof parseCatalogueResponse>[0]): string => {
    try {
      parseCatalogueResponse(raw);
      return "ok";
    } catch (error) {
      return (error as MarketplaceError).kind;
    }
  };

  it.each([
    [{ status: 403, contentType: "text/html", body: '<div class="cf-turnstile">' }, "challenge"],
    [{ status: 500, contentType: "text/html", body: "<h1>Oops</h1>" }, "upstream"],
    [{ status: 403, contentType: "application/json", body: '{"url":"https://geo.captcha-delivery.com/captcha"}' }, "blocked"],
    [{ status: 401, contentType: "application/json", body: "{}" }, "auth"],
    [{ status: 429, contentType: "application/json", body: "{}" }, "rate-limit"],
    [{ status: 200, contentType: "application/json", body: "nope" }, "bad-response"],
    [{ error: "TypeError: Failed to fetch" }, "upstream"],
    [{ status: 200, contentType: "application/json", body: '{"items":[]}' }, "ok"],
  ])("%j → %s", (raw, kind) => {
    expect(kindOf(raw)).toBe(kind);
  });
});

describe("network error classification", () => {
  it("treats DNS failures as offline (no backoff) and resets as transient", () => {
    const dns = Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("getaddrinfo"), { code: "ENOTFOUND" }) });
    expect(toMarketplaceError(dns)).toMatchObject({ kind: "offline", countsTowardsBackoff: false });
    const reset = Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("socket"), { code: "ECONNRESET" }) });
    expect(toMarketplaceError(reset)).toMatchObject({ kind: "upstream", retryable: true });
  });
});
