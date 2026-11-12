import type { Listing } from "@listingwatch/shared/schemas";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";

/**
 * Every photo of a listing. eBay search results carry only some photos, so the
 * full set is fetched when the viewer opens; Vinted's catalogue already has
 * all of them. Arrow keys and swipes move between photos. The viewer shows
 * each photo as large as the screen allows and shrinks to fit it, so there's
 * room around a tall photo to click away.
 */
export function ImageViewer({ listing, onClose }: { listing: Listing | null; onClose: () => void }) {
  return (
    <Dialog open={listing !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-fit max-w-[calc(100vw-1rem)] min-w-[min(20rem,calc(100vw-1rem))] gap-2 p-2 sm:max-w-[calc(100vw-1rem)] sm:p-3">
        {listing && <Viewer key={listing.key} listing={listing} />}
      </DialogContent>
    </Dialog>
  );
}

function Viewer({ listing }: { listing: Listing }) {
  const images = useListingImages(listing);
  const [index, setIndex] = useState(0);
  const count = images.urls.length;
  const shown = Math.min(index, count - 1);
  const go = (step: number): void => setIndex((i) => (count === 0 ? 0 : (i + step + count) % count));
  useArrowKeys(go);

  return (
    <>
      <ViewerHeader listing={listing} photoLabel={count > 1 ? `Photo ${shown + 1} of ${count}` : null} />
      <PhotoStage url={images.urls[shown] ?? null} loading={images.loading} canStep={count > 1} onStep={go} />
    </>
  );
}

/** Title, price and a link out. Its text never widens the viewer beyond the photo. */
function ViewerHeader({ listing, photoLabel }: { listing: Listing; photoLabel: string | null }) {
  return (
    <div className="flex items-start gap-3 pr-8 [contain:inline-size]">
      <div className="min-w-0 flex-1">
        <DialogTitle className="line-clamp-1 text-base leading-snug">{listing.title}</DialogTitle>
        <DialogDescription>
          {listing.price ? formatMoney(listing.price) : "Price not shown"}
          {photoLabel && ` · ${photoLabel}`}
        </DialogDescription>
      </div>
      <Button asChild variant="outline" size="sm" className="shrink-0">
        <a href={listing.url} target="_blank" rel="noopener noreferrer">
          Open listing <ExternalLink />
        </a>
      </Button>
    </div>
  );
}

/** Room the dialog's margin, padding and header take, so the photo fills the rest of the screen. */
const CHROME_WIDTH = "2.5rem";
const CHROME_HEIGHT = "6rem";

/**
 * The photo at the largest size that fits the screen. Its box takes the
 * photo's proportions once it loads (square until then), which sizes the dialog.
 */
function PhotoStage({ url, loading, canStep, onStep }: { url: string | null; loading: boolean; canStep: boolean; onStep: (step: number) => void }) {
  const [ratio, setRatio] = useState(1);
  const swipeStart = useRef<number | null>(null);
  const size: CSSProperties = {
    width: `min(calc(100vw - ${CHROME_WIDTH}), calc((100svh - ${CHROME_HEIGHT}) * ${ratio}))`,
    aspectRatio: ratio,
  };

  return (
    <div
      className="relative flex items-center justify-center overflow-hidden rounded-lg bg-black/40 touch-pan-y"
      style={size}
      onPointerDown={(e) => (swipeStart.current = e.clientX)}
      onPointerUp={(e) => {
        const start = swipeStart.current;
        swipeStart.current = null;
        if (start !== null && Math.abs(e.clientX - start) > 40) onStep(e.clientX < start ? 1 : -1);
      }}
    >
      {url ? (
        <img
          src={url}
          alt=""
          referrerPolicy="no-referrer"
          className="size-full object-contain select-none"
          draggable={false}
          onLoad={(e) => e.currentTarget.naturalHeight > 0 && setRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
        />
      ) : loading ? (
        <Spinner />
      ) : (
        <p className="text-sm text-muted-foreground">No photos</p>
      )}
      {canStep && (
        <>
          <Button variant="secondary" size="icon" className="absolute left-2" onClick={() => onStep(-1)} aria-label="Previous photo">
            <ChevronLeft />
          </Button>
          <Button variant="secondary" size="icon" className="absolute right-2" onClick={() => onStep(1)} aria-label="Next photo">
            <ChevronRight />
          </Button>
        </>
      )}
    </div>
  );
}

function useArrowKeys(onStep: (step: number) => void): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "ArrowRight") onStep(1);
      if (event.key === "ArrowLeft") onStep(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
}

function useListingImages(listing: Listing): { urls: string[]; loading: boolean } {
  const query = useQuery({
    queryKey: ["listing-images", listing.key],
    queryFn: ({ signal }) => api<{ images: string[] }>(`/listings/${listing.source}/${listing.itemId}/images?site=${listing.site}`, { signal }),
    enabled: listing.source === "ebay",
    staleTime: Infinity,
    retry: false,
  });
  const fetched = query.data?.images ?? [];
  return { urls: fetched.length > 0 ? fetched : listing.imageUrls, loading: query.isLoading };
}
