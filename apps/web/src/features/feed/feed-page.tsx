import type { Listing, Search } from "@listingwatch/shared/schemas";
import { ArrowUp, BellRing, Inbox, PauseCircle, Plus, SearchX, Trash2, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useClearFeed, useDismissListing, useFeed, useMarkFeedSeen, usePolling, useSearches, useSettings } from "@/api/hooks";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { liveArrivals } from "@/live/arrivals";
import { adviceFor } from "@/lib/error-advice";
import { plural } from "@/lib/format";
import { revealElement } from "@/lib/reveal-element";
import { isOneOf, useLocalPreference } from "@/lib/use-local-preference";
import { defaultCardSize, type CardSize } from "./listing-card";
import { activeFilterCount, applyListingFilters, DEFAULT_FILTERS, isListingFilters, type ListingFilters } from "./listing-filters";
import { ListingGrid } from "./listing-grid";
import { ListingToolbar } from "./listing-toolbar";

const CARD_SIZES = ["small", "medium", "large"] as const;
/** Scrolled further than this, new arrivals are announced with a pill rather than silently appearing above. */
const SCROLLED_AWAY_PX = 240;

export function FeedPage() {
  const feed = useFeed();
  const searches = useSearches();
  const clearFeed = useClearFeed();
  const { mutate: dismissListing } = useDismissListing();
  // Stable, so the memoised cards don't all redraw whenever this page does.
  const onDismiss = useCallback((listing: Listing) => dismissListing(listing.key), [dismissListing]);
  const [filters, setFilters] = useLocalPreference<ListingFilters>("feed.filters", DEFAULT_FILTERS, isListingFilters);
  const [size, setSize] = useLocalPreference<CardSize>("cardSize", defaultCardSize(), isOneOf(CARD_SIZES));
  const focused = useFocusedListings(filters, setFilters);
  const pending = useNewListingsPill();
  useMarkSeenWhileVisible();

  const all = feed.data?.listings ?? [];
  const shown = useMemo(() => applyListingFilters(all, filters), [all, filters]);
  const filtered = activeFilterCount(filters) > 0;

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        title="Feed"
        description={feed.data ? (filtered ? `${shown.length} of ${plural(all.length, "listing")}` : plural(all.length, "listing")) : "Loading…"}
        actions={
          all.length > 0 && (
            <ConfirmDialog
              trigger={
                <Button variant="outline" size="sm">
                  <Trash2 /> Clear feed
                </Button>
              }
              title="Clear the feed?"
              description="Every listing leaves the feed. They won't come back, and favourites are kept."
              confirmLabel="Clear feed"
              onConfirm={() => clearFeed.mutate()}
            />
          )
        }
      />
      <div className="sticky top-[calc(2.75rem+1px)] z-10 border-b bg-background/90 px-4 py-2 backdrop-blur md:top-0 md:px-6">
        <ListingToolbar filters={filters} onFiltersChange={setFilters} searches={searches.data ?? []} size={size} onSizeChange={setSize} />
      </div>
      {pending.count > 0 && (
        <Button className="fixed top-24 left-1/2 z-20 -translate-x-1/2 rounded-full shadow-lg md:top-6" size="sm" onClick={pending.showNew}>
          <ArrowUp />
          {plural(pending.count, "new listing")}
        </Button>
      )}
      <div className="flex-1 px-4 py-4 md:px-6">
        {feed.isLoading || searches.isLoading ? (
          <LoadingGrid />
        ) : shown.length > 0 ? (
          <ListingGrid listings={shown} searches={searches.data ?? []} size={size} highlighted={focused} onDismiss={onDismiss} />
        ) : all.length > 0 ? (
          <FilteredOut hidden={all.length} onClear={() => setFilters({ ...DEFAULT_FILTERS, sort: filters.sort })} />
        ) : (
          <EmptyFeed searches={searches.data ?? []} />
        )}
      </div>
    </div>
  );
}

/** Keep the feed marked as seen (on every device) while it's on screen. */
function useMarkSeenWhileVisible(): void {
  const markSeen = useMarkFeedSeen();
  const mark = useRef(markSeen.mutate);
  mark.current = markSeen.mutate;
  useEffect(() => {
    let timer: number | undefined;
    const markSoon = (): void => {
      if (document.visibilityState !== "visible" || window.scrollY > SCROLLED_AWAY_PX) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => mark.current(), 1500);
    };
    markSoon();
    document.addEventListener("visibilitychange", markSoon);
    window.addEventListener("scroll", markSoon, { passive: true });
    const unsubscribe = liveArrivals.subscribe(markSoon);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", markSoon);
      window.removeEventListener("scroll", markSoon);
      unsubscribe();
    };
  }, []);
}

/** Count arrivals while scrolled away from the top, for the "N new listings" pill. */
function useNewListingsPill(): { count: number; showNew: () => void } {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const unsubscribe = liveArrivals.subscribe((keys) => {
      if (window.scrollY > SCROLLED_AWAY_PX) setCount((n) => n + keys.length);
    });
    const onScroll = (): void => {
      if (window.scrollY <= SCROLLED_AWAY_PX) setCount(0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      unsubscribe();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);
  return { count, showNew: () => window.scrollTo({ top: 0, behavior: "smooth" }) };
}

/** Listings a notification pointed to: clear filters that would hide them, highlight and scroll to them. */
function useFocusedListings(filters: ListingFilters, setFilters: (f: ListingFilters) => void): ReadonlySet<string> {
  const location = useLocation();
  const navigate = useNavigate();
  const feed = useFeed();
  const [focused, setFocused] = useState<ReadonlySet<string>>(new Set());
  const requested = (location.state as { focus?: string[] } | null)?.focus;

  useEffect(() => {
    if (!requested || requested.length === 0 || !feed.data) return;
    setFocused(new Set(requested));
    if (activeFilterCount(filters) > 0) setFilters({ ...DEFAULT_FILTERS, sort: filters.sort });
    void navigate(".", { replace: true, state: null });
    window.setTimeout(() => void revealElement(`listing-${requested[0]}`), 100);
    const clear = window.setTimeout(() => setFocused(new Set()), 6000);
    return () => window.clearTimeout(clear);
  }, [requested, feed.data, filters, setFilters, navigate]);
  return focused;
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-3" aria-busy="true" aria-label="Loading listings">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-72 rounded-xl" />
      ))}
    </div>
  );
}

function FilteredOut({ hidden, onClear }: { hidden: number; onClear: () => void }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchX />
        </EmptyMedia>
        <EmptyTitle>No listings match the filters</EmptyTitle>
        <EmptyDescription>{plural(hidden, "listing is", "listings are")} hidden by them.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" onClick={onClear}>
          Clear filters
        </Button>
      </EmptyContent>
    </Empty>
  );
}

/** The empty feed says what's actually going on, so "working" and "broken" look different. */
function EmptyFeed({ searches }: { searches: readonly Search[] }) {
  const polling = usePolling();
  const settings = useSettings();
  const enabled = searches.filter((s) => s.enabled);
  const failing = enabled.filter((s) => s.status.lastError !== null);
  const backfill = settings.data?.settings.backfillHours ?? 0;

  if (searches.length === 0) {
    return <EmptyState icon={<Inbox />} title="No searches yet" description="Add an eBay or Vinted search, or paste a search page's link, and new listings will appear here." action={<AddSearchButton />} />;
  }
  if (polling.data?.paused) {
    return <EmptyState icon={<PauseCircle />} title="Polling is paused" description="Resume polling to start finding listings again." />;
  }
  if (enabled.length === 0) {
    return <EmptyState icon={<PauseCircle />} title="Every search is switched off" description="Switch a search on to start polling it." action={<Button asChild variant="outline"><Link to="/searches">Open searches</Link></Button>} />;
  }
  const first = failing[0];
  if (first && failing.length === enabled.length) {
    const advice = adviceFor(first.status.lastError!, first.source);
    return (
      <EmptyState
        icon={<TriangleAlert className="text-amber-500" />}
        title={failing.length === 1 ? advice.title : `All ${failing.length} searches are failing`}
        description={failing.length === 1 ? advice.advice : `${first.name}: ${advice.title}. ${advice.advice}`}
        action={advice.fixAt && <Button asChild><Link to={advice.fixAt.to}>{advice.fixAt.label}</Link></Button>}
      />
    );
  }
  return (
    <EmptyState
      icon={<BellRing />}
      title={`Watching ${plural(enabled.length, "search", "searches")}`}
      description={
        backfill > 0
          ? `New listings will appear here. Searches also show anything from the last ${plural(backfill, "hour")} when they first run.`
          : "New listings will appear here as soon as they're posted."
      }
    />
  );
}

function EmptyState({ icon, title, description, action }: { icon: React.ReactNode; title: string; description: string; action?: React.ReactNode }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

function AddSearchButton() {
  return (
    <Button asChild>
      <Link to="/searches?new=1">
        <Plus />
        Add a search
      </Link>
    </Button>
  );
}
