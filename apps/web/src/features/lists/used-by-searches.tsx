import type { Search } from "@listingwatch/shared/schemas";
import type { CSSProperties } from "react";

/** The searches a match list is attached to, as chips in each search's colour. */
export function UsedBySearches({ searches }: { searches: readonly Search[] }) {
  if (searches.length === 0) return <span className="text-xs text-muted-foreground">Not used by any search yet</span>;
  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label="Used by">
      {searches.map((search) => (
        <li
          key={search.id}
          className="search-chip flex max-w-56 items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-xs"
          style={{ "--search-color": search.color ?? "var(--muted-foreground)" } as CSSProperties}
        >
          <span className="search-marker h-3 w-1 shrink-0 rounded-full" aria-hidden />
          <span className="truncate font-medium" style={{ color: search.color ?? undefined }}>
            {search.name}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Searches that require titles to match the list. */
export function searchesUsingList(searches: readonly Search[] | undefined, listId: string): Search[] {
  return searches?.filter((s) => s.includeListIds.includes(listId)) ?? [];
}
