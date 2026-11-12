import type { Listing, Search } from "@listingwatch/shared/schemas";
import { useCallback, useMemo, useState } from "react";
import { useFavourites, useSetFavourite } from "@/api/hooks";
import { liveArrivals } from "@/live/arrivals";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { ImageViewer } from "./image-viewer";
import { ListingCard, type CardSize } from "./listing-card";

const GRID_CLASSES: Record<CardSize, string> = {
  small: "grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(22rem,1fr))]",
  medium: "grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))]",
  large: "grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))]",
};

/** Listing cards in a responsive grid, with favourites and the image viewer wired up. */
export function ListingGrid({
  listings,
  searches,
  size,
  highlighted,
  onDismiss,
}: {
  listings: readonly Listing[];
  searches: readonly Search[];
  size: CardSize;
  highlighted?: ReadonlySet<string>;
  onDismiss?: (listing: Listing) => void;
}) {
  const now = useNow();
  const favourites = useFavourites();
  // `mutate` is stable, so the callback is too, and memoised cards only redraw when their own props change.
  const { mutate: setFavourite } = useSetFavourite();
  const [viewing, setViewing] = useState<Listing | null>(null);
  const searchesById = useMemo(() => new Map(searches.map((s) => [s.id, s])), [searches]);
  const favouriteKeys = useMemo(() => new Set(favourites.data?.map((f) => f.listing.key)), [favourites.data]);
  const onToggleFavourite = useCallback((listing: Listing, favourite: boolean) => setFavourite({ listing, favourite }), [setFavourite]);

  return (
    <>
      <div className={cn("grid gap-3", GRID_CLASSES[size])}>
        {listings.map((listing) => (
          <ListingCard
            key={listing.key}
            listing={listing}
            searches={searchesById}
            size={size}
            now={now}
            favourite={favouriteKeys.has(listing.key)}
            arrived={liveArrivals.isLive(listing.key)}
            highlighted={highlighted?.has(listing.key) ?? false}
            onToggleFavourite={onToggleFavourite}
            onShowImages={setViewing}
            {...(onDismiss ? { onDismiss } : {})}
          />
        ))}
      </div>
      <ImageViewer listing={viewing} onClose={() => setViewing(null)} />
    </>
  );
}
