import { Star } from "lucide-react";
import { useMemo } from "react";
import { useClearFavourites, useFavourites, useSearches } from "@/api/hooks";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { plural } from "@/lib/format";
import { isOneOf, useLocalPreference } from "@/lib/use-local-preference";
import { defaultCardSize, type CardSize } from "../feed/listing-card";
import { activeFilterCount, applyListingFilters, DEFAULT_FILTERS, isListingFilters, type ListingFilters } from "../feed/listing-filters";
import { ListingGrid } from "../feed/listing-grid";
import { ListingToolbar } from "../feed/listing-toolbar";

/** Saved listings, with the same filters and sorting as the feed. */
export function FavouritesPage() {
  const favourites = useFavourites();
  const searches = useSearches();
  const clear = useClearFavourites();
  const [filters, setFilters] = useLocalPreference<ListingFilters>("favourites.filters", DEFAULT_FILTERS, isListingFilters);
  const [size, setSize] = useLocalPreference<CardSize>("cardSize", defaultCardSize(), isOneOf(["small", "medium", "large"] as const));
  const all = useMemo(() => favourites.data?.map((f) => f.listing) ?? [], [favourites.data]);
  const shown = useMemo(() => applyListingFilters(all, filters), [all, filters]);
  const filtered = activeFilterCount(filters) > 0;

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        title="Favourites"
        description={favourites.data ? (filtered ? `${shown.length} of ${plural(all.length, "favourite")}` : plural(all.length, "favourite")) : "Loading…"}
        actions={
          all.length > 0 && (
            <ConfirmDialog
              trigger={<Button variant="ghost" size="sm">Clear all</Button>}
              title="Remove every favourite?"
              description={`All ${plural(all.length, "saved listing")} will be removed. This can't be undone.`}
              confirmLabel="Remove all"
              onConfirm={() => clear.mutate()}
            />
          )
        }
      />
      {all.length > 0 && (
        <div className="border-b px-4 py-2 md:px-6">
          <ListingToolbar filters={filters} onFiltersChange={setFilters} searches={searches.data ?? []} size={size} onSizeChange={setSize} />
        </div>
      )}
      <div className="flex-1 px-4 py-4 md:px-6">
        {favourites.isLoading ? (
          <Skeleton className="h-72 w-full max-w-sm rounded-xl" />
        ) : shown.length > 0 ? (
          <ListingGrid listings={shown} searches={searches.data ?? []} size={size} />
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Star />
              </EmptyMedia>
              <EmptyTitle>{all.length > 0 ? "No favourites match the filters" : "No favourites yet"}</EmptyTitle>
              <EmptyDescription>{all.length > 0 ? "Clear the filters to see them all." : "Star a listing on the feed to keep it here."}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </div>
  );
}
