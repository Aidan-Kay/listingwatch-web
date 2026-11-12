import { ebaySite, vintedSite } from "@listingwatch/shared/marketplaces";
import type { Search } from "@listingwatch/shared/schemas";
import { Bell, BellOff, Copy, MoreHorizontal, Pencil, Trash2, TriangleAlert } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { Link } from "react-router";
import { useDeleteSearch, useDuplicateSearch, useMatchLists, useSetSearchFlags } from "@/api/hooks";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { adviceFor } from "@/lib/error-advice";
import { flag, formatMoney, timeAgo } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

/** One saved search: what it looks for, how its last poll went, and its controls. */
export function SearchCard({ search, onEdit }: { search: Search; onEdit: () => void }) {
  const setFlags = useSetSearchFlags();
  const duplicate = useDuplicateSearch();
  const remove = useDeleteSearch();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const error = search.enabled ? search.status.lastError : null;

  return (
    <article
      className={cn("relative flex gap-3 rounded-xl border bg-card p-3 pl-4", !search.enabled && "opacity-60", error && "border-amber-500/50")}
      style={{ "--search-color": search.color ?? "transparent" } as CSSProperties}
    >
      <span className="search-marker absolute inset-y-3 left-0 w-1 rounded-r-full" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-medium" style={{ color: search.color ?? undefined }}>
            {search.name}
          </h3>
          <span className="shrink-0 text-xs text-muted-foreground">{flag(search.site)}</span>
        </div>
        <Summary search={search} />
        {error ? <ErrorLine search={search} /> : <StatusLine search={search} />}
      </div>
      <div className="flex shrink-0 items-start gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setFlags.mutate({ id: search.id, notify: !search.notify })}
              aria-pressed={search.notify}
              aria-label={search.notify ? "Mute notifications" : "Turn on notifications"}
            >
              {search.notify ? <Bell /> : <BellOff className="text-muted-foreground" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{search.notify ? "Notifications on" : "Notifications muted"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex h-7 items-center px-1">
              <Switch checked={search.enabled} onCheckedChange={(enabled) => setFlags.mutate({ id: search.id, enabled })} aria-label={search.enabled ? "Stop polling" : "Start polling"} />
            </span>
          </TooltipTrigger>
          <TooltipContent>{search.enabled ? "Polling" : "Not polling"}</TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${search.name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => duplicate.mutate(search.id)}>
              <Copy /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete “${search.name}”?`}
        description="Its listings leave the feed unless another search found them too. Favourites are kept."
        confirmLabel="Delete search"
        onConfirm={() => remove.mutate(search.id)}
      />
    </article>
  );
}

/** What the search looks for, in one line. */
function Summary({ search }: { search: Search }) {
  const lists = useMatchLists();
  const listNames = search.includeListIds.map((id) => lists.data?.find((l) => l.id === id)?.name).filter(Boolean);
  const currency = (search.source === "ebay" ? ebaySite(search.site) : vintedSite(search.site))?.currency ?? "GBP";
  const price = (value: number | null): string | null => (value === null ? null : formatMoney({ amount: value, currency }));
  const min = price(search.minPrice);
  const max = price(search.maxPrice);
  const parts = [
    search.keywords ? `“${search.keywords}”` : search.category ? "Whole category" : "Everything",
    search.category ? `category ${search.category}` : null,
    min && max ? `${min}–${max}` : min ? `from ${min}` : max ? `up to ${max}` : null,
    search.conditions.length > 0 ? `${search.conditions.length} condition${search.conditions.length > 1 ? "s" : ""}` : null,
    listNames.length > 0 ? `matching ${listNames.join(", ")}` : null,
    search.excludeKeywords.length > 0 ? `excluding ${search.excludeKeywords.length} word${search.excludeKeywords.length > 1 ? "s" : ""}` : null,
  ].filter(Boolean);
  return <p className="mt-0.5 truncate text-sm text-muted-foreground">{parts.join(" · ")}</p>;
}

function StatusLine({ search }: { search: Search }) {
  const now = useNow();
  const { lastPolledAt, baselineDone, lastNewCount } = search.status;
  const text = !search.enabled
    ? "Not polling"
    : lastPolledAt === null
      ? "Waiting for the first poll…"
      : `Checked ${timeAgo(lastPolledAt, now)}${!baselineDone ? " · recording current listings" : lastNewCount > 0 ? ` · ${lastNewCount} new` : ""}`;
  return <p className="mt-1 text-xs text-muted-foreground">{text}</p>;
}

function ErrorLine({ search }: { search: Search }) {
  const now = useNow();
  const error = search.status.lastError!;
  const advice = adviceFor(error, search.source);
  return (
    <div className="mt-1.5 flex items-start gap-1.5 text-xs">
      <TriangleAlert className="mt-px size-3.5 shrink-0 text-amber-500" aria-hidden />
      <p>
        <span className="font-medium text-amber-600 dark:text-amber-400">{advice.title}</span>
        <span className="text-muted-foreground">
          {" "}
          · {timeAgo(error.at, now)}
          {search.status.consecutiveErrors > 1 && ` · ${search.status.consecutiveErrors} failures in a row`}. {advice.advice}
        </span>
        {advice.fixAt && (
          <>
            {" "}
            <Link to={advice.fixAt.to} className="font-medium underline">
              {advice.fixAt.label}
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
