import { describe, expect, it } from "vitest";
import { parseSearchUrl, type ImportedSearch } from "../src/url-import/index.ts";

function imported(url: string): ImportedSearch {
  const result = parseSearchUrl(url);
  if (!result.ok) throw new Error(result.reason);
  return result.search;
}

describe("eBay URLs", () => {
  it("reads keywords, category from the path, price, format, conditions and location", () => {
    const search = imported(
      "https://www.ebay.co.uk/sch/139973/i.html?_nkw=pokemon+emerald&_udlo=10&_udhi=150&LH_BIN=1&LH_ItemCondition=1000|3000&LH_PrefLoc=1",
    );
    expect(search).toMatchObject({
      source: "ebay",
      site: "UK",
      name: "pokemon emerald — eBay UK",
      keywords: "pokemon emerald",
      category: "139973",
      minPrice: 10,
      maxPrice: 150,
      format: "buy_now",
      conditions: ["1000", "3000"],
      itemLocation: "GB",
    });
  });

  it("prefers _dcat, ignores _sacat=0, and maps legacy condition codes", () => {
    expect(imported("https://www.ebay.com/sch/i.html?_nkw=x&_dcat=617&_sacat=0&LH_ItemCondition=3").category).toBe("617");
    expect(imported("https://www.ebay.com/sch/i.html?_nkw=x&_sacat=0").category).toBeNull();
    expect(imported("https://www.ebay.com/sch/i.html?_nkw=x&LH_ItemCondition=3").conditions).toEqual(["3000"]);
  });

  it("turns non-system parameters into aspect filters, decoding twice-encoded values", () => {
    const search = imported("https://www.ebay.co.uk/sch/i.html?_nkw=ps2&Platform=Sony%2520PlayStation%25202|!&Region%2520Code=PAL&hash=item1");
    expect(search.filters).toEqual([
      { name: "Platform", values: ["Sony PlayStation 2"] },
      { name: "Region Code", values: ["PAL"] },
    ]);
  });

  it("accepts addresses without www and auction listings", () => {
    const search = imported("https://ebay.de/sch/i.html?_nkw=lego&LH_Auction=1");
    expect(search).toMatchObject({ site: "DE", format: "auction" });
  });
});

describe("Vinted URLs", () => {
  it("reads keywords, categories, price, conditions and filters", () => {
    const search = imported(
      "https://www.vinted.co.uk/catalog?search_text=gamecube&catalog[]=3026&catalog[]=1234&price_from=5&price_to=60&status_ids[]=6&status_ids[]=99&video_game_platform_ids[]=1281&video_game_platform_ids[]=1282&order=newest_first",
    );
    expect(search).toEqual({
      source: "vinted",
      site: "UK",
      name: "gamecube — Vinted UK",
      keywords: "gamecube",
      minPrice: 5,
      maxPrice: 60,
      category: "3026",
      conditions: ["6"],
      filters: [
        { name: "catalog", values: ["1234"] },
        { name: "video_game_platform_ids", values: ["1281", "1282"] },
      ],
    });
  });

  it("names a keyword-less search after its site", () => {
    expect(imported("https://www.vinted.fr/catalog?catalog[]=5").name).toBe("Vinted FR");
  });
});

describe("rejections", () => {
  it.each([
    ["not a url", "That isn't a web address"],
    ["https://www.amazon.co.uk/s?k=x", "Paste a search page from eBay or Vinted"],
  ])("%s", (input, reason) => {
    expect(parseSearchUrl(input)).toEqual({ ok: false, reason });
  });
});
