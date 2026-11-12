import type { Source } from "@listingwatch/shared/marketplaces";
import { searchConfigOf, searchInputSchema, type EbayFormat, type Search, type SearchInput } from "@listingwatch/shared/schemas";
import type { ImportedSearch } from "@listingwatch/shared/url-import";

/** A filter row as typed: values comma-separated. */
export interface DraftFilterRow {
  id: number;
  name: string;
  values: string;
}

/**
 * The editor's working copy of a search. Numbers stay as the text the user
 * typed until saving, so half-typed values ("1.") don't fight the input.
 */
export interface SearchDraft {
  source: Source;
  site: string;
  name: string;
  keywords: string;
  minPrice: string;
  maxPrice: string;
  category: string | null;
  conditions: string[];
  filters: DraftFilterRow[];
  format: EbayFormat;
  itemLocation: string | null;
  includeListIds: string[];
  excludeKeywords: string;
  enabled: boolean;
  notify: boolean;
  maxNotifyPrice: string;
  color: string | null;
  minInterval: string;
  maxInterval: string;
}

let nextRowId = 1;
export const newFilterRow = (name = "", values = ""): DraftFilterRow => ({ id: nextRowId++, name, values });

export function emptyDraft(source: Source = "ebay"): SearchDraft {
  return {
    source,
    site: "UK",
    name: "",
    keywords: "",
    minPrice: "",
    maxPrice: "",
    category: null,
    conditions: [],
    filters: [],
    format: "all",
    itemLocation: null,
    includeListIds: [],
    excludeKeywords: "",
    enabled: true,
    notify: true,
    maxNotifyPrice: "",
    color: null,
    minInterval: "",
    maxInterval: "",
  };
}

export function draftFromSearch(search: Search): SearchDraft {
  const config = searchConfigOf(search);
  return {
    ...emptyDraft(config.source),
    ...textFields(config),
    source: config.source,
    site: config.site,
    name: config.name,
    category: config.category,
    conditions: config.conditions,
    filters: config.filters.map((row) => newFilterRow(row.name, row.values.join(", "))),
    format: config.source === "ebay" ? config.format : "all",
    itemLocation: config.source === "ebay" ? config.itemLocation : null,
    includeListIds: config.includeListIds,
    excludeKeywords: config.excludeKeywords.join(", "),
    enabled: config.enabled,
    notify: config.notify,
    color: config.color,
  };
}

/** Fill the draft from a pasted URL, keeping what the link can't say (name when editing, notifications, colour…). */
export function applyImport(draft: SearchDraft, imported: ImportedSearch, keepName: boolean): SearchDraft {
  return {
    ...draft,
    source: imported.source,
    site: imported.site,
    name: keepName && draft.name ? draft.name : imported.name,
    keywords: imported.keywords,
    minPrice: imported.minPrice?.toString() ?? "",
    maxPrice: imported.maxPrice?.toString() ?? "",
    category: imported.category,
    conditions: imported.conditions,
    filters: imported.filters.map((row) => newFilterRow(row.name, row.values.join(", "))),
    format: imported.source === "ebay" ? imported.format : "all",
    itemLocation: imported.source === "ebay" ? imported.itemLocation : null,
  };
}

export type DraftErrors = Partial<Record<string, string>>;

/** Validate with the same schema the server uses. Returns the input, or a message per field. */
export function draftToInput(draft: SearchDraft): { ok: true; input: SearchInput } | { ok: false; errors: DraftErrors } {
  const result = searchInputSchema.safeParse({
    source: draft.source,
    site: draft.site,
    name: draft.name,
    keywords: draft.keywords,
    minPrice: optionalNumber(draft.minPrice),
    maxPrice: optionalNumber(draft.maxPrice),
    category: draft.category,
    conditions: draft.conditions,
    filters: draft.filters
      .map((row) => ({ name: row.name.trim(), values: splitList(row.values) }))
      .filter((row) => row.name !== "" || row.values.length > 0),
    ...(draft.source === "ebay" ? { format: draft.format, itemLocation: draft.itemLocation } : {}),
    includeListIds: draft.includeListIds,
    excludeKeywords: splitList(draft.excludeKeywords),
    enabled: draft.enabled,
    notify: draft.notify,
    maxNotifyPrice: optionalNumber(draft.maxNotifyPrice),
    color: draft.color,
    minInterval: optionalNumber(draft.minInterval),
    maxInterval: optionalNumber(draft.maxInterval),
  });
  if (result.success) return { ok: true, input: result.data };
  const errors: DraftErrors = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? "form");
    errors[field] ??= field === "filters" ? "Each filter needs a name and at least one value" : issue.message;
  }
  return { ok: false, errors };
}

export function splitList(text: string): string[] {
  return text
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

/** "" → null; anything else must be a number (NaN fails validation with a clear message). */
function optionalNumber(text: string): number | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : Number(trimmed.replace(",", "."));
}

function textFields(config: SearchInput): Pick<SearchDraft, "keywords" | "minPrice" | "maxPrice" | "maxNotifyPrice" | "minInterval" | "maxInterval"> {
  const text = (value: number | null): string => value?.toString() ?? "";
  return {
    keywords: config.keywords,
    minPrice: text(config.minPrice),
    maxPrice: text(config.maxPrice),
    maxNotifyPrice: text(config.maxNotifyPrice),
    minInterval: text(config.minInterval),
    maxInterval: text(config.maxInterval),
  };
}
