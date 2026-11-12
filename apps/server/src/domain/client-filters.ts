import { countTerms, matchTitle, type CompiledList } from "@listingwatch/shared/keyword-match";
import type { FoundListing } from "@listingwatch/shared/schemas";

export interface FilteredListing extends FoundListing {
  matchedTerms: string[];
}

export interface ClientFilterResult {
  kept: FilteredListing[];
  rejectedByMatchLists: FoundListing[];
  rejectedByExcludes: FoundListing[];
}

/**
 * The filters the marketplaces can't apply, in order:
 *   1. match lists — keep only titles matching a term, recording which terms;
 *      lists with no usable terms don't filter at all (never "match nothing");
 *   2. exclude keywords — drop titles containing any of them.
 */
export function applyClientFilters(
  listings: readonly FoundListing[],
  lists: readonly CompiledList[],
  excludeKeywords: readonly string[],
): ClientFilterResult {
  const filterByLists = countTerms(lists) > 0;
  const result: ClientFilterResult = { kept: [], rejectedByMatchLists: [], rejectedByExcludes: [] };
  for (const listing of listings) {
    const matchedTerms = filterByLists ? matchTitle(listing.title, lists) : [];
    if (filterByLists && matchedTerms.length === 0) {
      result.rejectedByMatchLists.push(listing);
      continue;
    }
    const title = listing.title.toLowerCase();
    if (excludeKeywords.some((word) => title.includes(word))) {
      result.rejectedByExcludes.push(listing);
      continue;
    }
    result.kept.push({ ...listing, matchedTerms });
  }
  return result;
}
