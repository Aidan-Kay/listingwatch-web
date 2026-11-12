import { parseSearchUrl } from "@listingwatch/shared/url-import";
import { describe, expect, it } from "vitest";
import { applyImport, draftToInput, emptyDraft, newFilterRow } from "./draft";

describe("draftToInput", () => {
  it("turns typed text into a validated search", () => {
    const result = draftToInput({
      ...emptyDraft("vinted"),
      name: " Gamecube ",
      minPrice: "5,50",
      maxPrice: "",
      excludeKeywords: "Broken, , faulty",
      filters: [newFilterRow("brand_ids", "53, 88"), newFilterRow("", "")],
    });
    expect(result).toEqual({
      ok: true,
      input: expect.objectContaining({ name: "Gamecube", minPrice: 5.5, maxPrice: null, excludeKeywords: ["broken", "faulty"], filters: [{ name: "brand_ids", values: ["53", "88"] }] }),
    });
  });

  it("reports problems per field", () => {
    const result = draftToInput({ ...emptyDraft(), name: "", minPrice: "abc", maxInterval: "10" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["maxInterval", "minPrice", "name"]);
  });

  it("asks for a name on half-filled filter rows", () => {
    const result = draftToInput({ ...emptyDraft(), name: "x", filters: [newFilterRow("", "a")] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.filters).toMatch(/name and at least one value/);
  });
});

describe("applyImport", () => {
  it("fills in what the link says and keeps the rest", () => {
    const parsed = parseSearchUrl("https://www.ebay.co.uk/sch/i.html?_nkw=ps2&_udhi=50&LH_Auction=1");
    if (!parsed.ok) throw new Error(parsed.reason);
    const draft = applyImport({ ...emptyDraft(), name: "My PS2 search", notify: false, color: "#22c55e" }, parsed.search, true);
    expect(draft).toMatchObject({ name: "My PS2 search", keywords: "ps2", maxPrice: "50", format: "auction", notify: false, color: "#22c55e" });
  });
});
