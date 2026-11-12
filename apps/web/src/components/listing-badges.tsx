import type { BuyingFormat, Source } from "@listingwatch/shared/marketplaces";
import { Badge } from "@/components/ui/badge";
import { siteLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const BADGE_SHAPE = "rounded-md border-transparent";

/** eBay's four logo colours, one per letter. */
const EBAY_LETTER_COLOURS = ["#ff343b", "#0c68ca", "#d19600", "#76ad00"];

/** The marketplace and site in its own colours, so the platform reads at a glance. */
export function PlatformBadge({ source, site, className }: { source: Source; site: string; className?: string }) {
  if (source === "ebay") {
    return (
      <Badge className={cn(BADGE_SHAPE, "gap-0 bg-neutral-200 text-neutral-800", className)} aria-label={`eBay ${site}`}>
        {[..."eBay"].map((letter, i) => (
          <span key={i} style={{ color: EBAY_LETTER_COLOURS[i] }} aria-hidden>
            {letter}
          </span>
        ))}
        <span className="ml-1" aria-hidden>
          {site}
        </span>
      </Badge>
    );
  }
  return <Badge className={cn(BADGE_SHAPE, "bg-teal-600 text-neutral-50", className)}>{siteLabel(source, site)}</Badge>;
}

const FORMAT_STYLES: Partial<Record<BuyingFormat, { label: string; className: string }>> = {
  "Buy It Now": { label: "BIN", className: "bg-green-600/20 text-green-700 dark:text-green-400" },
  Auction: { label: "Auction", className: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400" },
  "Best Offer": { label: "Offer", className: "bg-blue-600/20 text-blue-700 dark:text-blue-400" },
};

/** BIN, Auction or Offer in its own colour; nothing for formats without a badge. */
export function FormatBadge({ format }: { format: BuyingFormat }) {
  const style = FORMAT_STYLES[format];
  if (!style) return null;
  return (
    <Badge className={cn(BADGE_SHAPE, style.className)} title={format}>
      {style.label}
    </Badge>
  );
}
