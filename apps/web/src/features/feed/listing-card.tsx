import type { Listing, Search } from "@listingwatch/shared/schemas";
import { Gavel, ImageOff, Images, Star, X } from "lucide-react";
import { memo, type CSSProperties } from "react";
import { FormatBadge, PlatformBadge } from "@/components/listing-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMoney, formatShipping, timeAgo, timeLeft } from "@/lib/format";
import { cn } from "@/lib/utils";
import { freshness } from "./listing-filters";

export type CardSize = "small" | "medium" | "large";

/** Phones get the compact list by default; bigger screens get the grid. */
export function defaultCardSize(): CardSize {
  return window.matchMedia("(max-width: 639px)").matches ? "small" : "medium";
}

export interface ListingCardProps {
  listing: Listing;
  searches: ReadonlyMap<string, Search>;
  size: CardSize;
  now: number;
  favourite: boolean;
  /** Arrived while the app was open: plays a one-off flare. */
  arrived?: boolean;
  highlighted?: boolean;
  onToggleFavourite: (listing: Listing, favourite: boolean) => void;
  onShowImages: (listing: Listing) => void;
  /** Only on the feed. */
  onDismiss?: (listing: Listing) => void;
}

/**
 * One listing. The title is the link to the marketplace; the photo opens the
 * image viewer. The card takes the colour of the search that found it, and
 * badges show the marketplace and buying format.
 */
export const ListingCard = memo(function ListingCard(props: ListingCardProps) {
  const { listing, size, now } = props;
  const heat = freshness(listing, now);
  const ended = listing.endsAt !== null && Date.parse(listing.endsAt) <= now;
  const compact = size === "small";
  const cardColour = searchColour(listing, props.searches);
  return (
    <article
      id={`listing-${listing.key}`}
      data-size={size}
      data-arrived={props.arrived ? "true" : undefined}
      style={{ "--heat": heat.toFixed(3), ...(cardColour && { "--card-colour": cardColour }) } as CSSProperties}
      data-coloured={cardColour ? "true" : undefined}
      className={cn(
        "listing-card group relative isolate flex overflow-hidden rounded-xl border bg-card text-card-foreground",
        compact ? "flex-row" : "flex-col",
        ended && "opacity-55",
        props.highlighted && "ring-2 ring-primary",
      )}
    >
      <Thumbnail {...props} compact={compact} />
      <div className={cn("flex min-w-0 flex-1 flex-col gap-1.5", compact ? "p-2.5" : "p-3")}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <SearchTags listing={listing} searches={props.searches} />
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {listing.source === "ebay" && listing.buyingFormats.map((format) => <FormatBadge key={format} format={format} />)}
            <PlatformBadge source={listing.source} site={listing.site} />
          </div>
        </div>
        <h3 className={cn("font-medium leading-snug", compact ? "line-clamp-2 text-sm" : "line-clamp-2")}>
          <a href={listing.url} target="_blank" rel="noopener noreferrer" className="outline-none after:absolute after:inset-0 hover:underline focus-visible:underline">
            {listing.title}
          </a>
        </h3>
        <PriceLine listing={listing} now={now} />
        <Details listing={listing} />
        <footer className="mt-auto flex items-center gap-2 pt-1 text-xs text-muted-foreground">
          <span className="freshness-dot size-1.5 shrink-0 rounded-full" aria-hidden />
          <time dateTime={listing.listedAt} title={listing.listedAtEstimated ? "When ListingWatch first saw it" : "When it was listed"}>
            {listing.listedAtEstimated ? "Seen " : ""}
            {timeAgo(listing.listedAt, now)}
          </time>
          <Actions {...props} />
        </footer>
      </div>
    </article>
  );
});

function Thumbnail({ listing, compact, onShowImages }: ListingCardProps & { compact: boolean }) {
  const count = listing.imageUrls.length;
  return (
    <button
      type="button"
      onClick={() => onShowImages(listing)}
      className={cn("relative z-10 shrink-0 overflow-hidden bg-muted", compact ? "w-24 self-stretch" : "aspect-[4/3] w-full")}
      aria-label={`View photos of ${listing.title}`}
    >
      {listing.imageUrl ? (
        <img src={listing.imageUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
      ) : (
        <ImageOff className="absolute inset-0 m-auto size-6 text-muted-foreground" aria-hidden />
      )}
      {count > 1 && (
        <span className="absolute right-1.5 bottom-1.5 flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[0.7rem] text-white">
          <Images className="size-3" aria-hidden />
          {count}
        </span>
      )}
    </button>
  );
}

/** The colour of the first search that found the listing and has one. */
function searchColour(listing: Listing, searches: ReadonlyMap<string, Search>): string | null {
  for (const id of listing.searchIds) {
    const colour = searches.get(id)?.color;
    if (colour) return colour;
  }
  return null;
}

function SearchTags({ listing, searches }: { listing: Listing; searches: ReadonlyMap<string, Search> }) {
  const tags = listing.searchIds.map((id) => searches.get(id)).filter((s): s is Search => s !== undefined);
  if (tags.length === 0) return <span className="flex-1" />;
  // Takes its natural width, so the badges wrap below it rather than truncating the names.
  return (
    <div className="flex min-w-0 flex-[1_1_max-content] flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
      {tags.map((search) => (
        <span key={search.id} className="flex min-w-0 items-center gap-1.5" style={{ "--search-color": search.color ?? "var(--muted-foreground)" } as CSSProperties}>
          <span className="search-marker h-3 w-1 shrink-0 rounded-full" aria-hidden />
          <span className="truncate font-medium" style={{ color: search.color ?? undefined }}>
            {search.name}
          </span>
        </span>
      ))}
    </div>
  );
}

function PriceLine({ listing, now }: { listing: Listing; now: number }) {
  const shipping = formatShipping(listing.shipping);
  const auction = listing.buyingFormats.includes("Auction");
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="text-base font-semibold tabular-nums">{listing.price ? formatMoney(listing.price) : "Price not shown"}</span>
      {listing.priceIsBid && <span className="text-xs text-muted-foreground">current bid</span>}
      {shipping && <span className="text-xs text-muted-foreground">{shipping}</span>}
      {auction && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Gavel className="size-3" aria-hidden />
          {listing.bidCount} {listing.bidCount === 1 ? "bid" : "bids"}
          {listing.endsAt && ` · ${timeLeft(listing.endsAt, now)}`}
        </span>
      )}
    </div>
  );
}

function Details({ listing }: { listing: Listing }) {
  return (
    <div className="flex flex-wrap gap-1">
      {listing.condition && <Badge variant="secondary">{listing.condition}</Badge>}
      {listing.brand && <Badge variant="secondary">{listing.brand}</Badge>}
      {listing.matchedTerms.slice(0, 3).map((term) => (
        <Badge key={term} variant="outline" className="border-primary/40 text-primary" title="Matched by a match list">
          {term}
        </Badge>
      ))}
    </div>
  );
}

function Actions({ listing, favourite, onToggleFavourite, onDismiss }: ListingCardProps) {
  return (
    <div className="relative z-10 ml-auto flex items-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-xs" onClick={() => onToggleFavourite(listing, !favourite)} aria-pressed={favourite} aria-label={favourite ? "Remove from favourites" : "Add to favourites"}>
            <Star className={cn(favourite && "fill-amber-400 text-amber-400")} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{favourite ? "Remove from favourites" : "Add to favourites"}</TooltipContent>
      </Tooltip>
      {onDismiss && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-xs" onClick={() => onDismiss(listing)} aria-label="Remove from feed">
              <X />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Remove from feed</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
