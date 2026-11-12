import type { FoundListing, SearchInput, TestedListing, TestSearchResult } from "@listingwatch/shared/schemas";
import { useMutation } from "@tanstack/react-query";
import { FlaskConical, ImageOff } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/api";
import { formatMoney, plural, timeAgo } from "@/lib/format";
import { useNow } from "@/lib/use-now";

/**
 * Run the search as configured, once, without saving, and show what it finds
 * and what each result filter drops: configuration with immediate feedback.
 */
export function TestPanel({ getInput }: { getInput: () => SearchInput | null }) {
  const test = useMutation({ mutationFn: (input: SearchInput) => api<TestSearchResult>("/searches/test", { method: "POST", body: input }) });
  const run = (): void => {
    const input = getInput();
    if (input) test.mutate(input);
  };
  return (
    <div className="flex flex-col gap-3">
      <Button variant="secondary" onClick={run} disabled={test.isPending} className="self-start">
        {test.isPending ? <Spinner /> : <FlaskConical />}
        {test.isPending ? "Searching…" : test.data ? "Test again" : "Test this search"}
      </Button>
      {test.isError && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(test.error)}</AlertDescription>
        </Alert>
      )}
      {test.data && !test.isPending && <TestResults result={test.data} />}
    </div>
  );
}

function TestResults({ result }: { result: TestSearchResult }) {
  const [showing, setShowing] = useState<"kept" | "lists" | "excludes">("kept");
  const total = result.kept.length + result.rejectedByMatchLists.length + result.rejectedByExcludes.length;
  const shown: readonly (FoundListing | TestedListing)[] = showing === "kept" ? result.kept : showing === "lists" ? result.rejectedByMatchLists : result.rejectedByExcludes;
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <p className="text-sm">
        The marketplace returned {plural(total, "listing")}; <strong>{result.kept.length}</strong> pass your result filters.
      </p>
      <div className="flex flex-wrap gap-1.5">
        <FilterChip active={showing === "kept"} onClick={() => setShowing("kept")} label={`Kept (${result.kept.length})`} />
        {result.rejectedByMatchLists.length > 0 && <FilterChip active={showing === "lists"} onClick={() => setShowing("lists")} label={`Not in match lists (${result.rejectedByMatchLists.length})`} />}
        {result.rejectedByExcludes.length > 0 && <FilterChip active={showing === "excludes"} onClick={() => setShowing("excludes")} label={`Excluded words (${result.rejectedByExcludes.length})`} />}
      </div>
      <ul className="flex max-h-96 flex-col divide-y overflow-y-auto">
        {shown.map((listing) => (
          <TestRow key={listing.itemId} listing={listing} />
        ))}
        {shown.length === 0 && <li className="py-3 text-sm text-muted-foreground">Nothing here.</li>}
      </ul>
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <Button size="xs" variant={active ? "default" : "outline"} onClick={onClick} aria-pressed={active}>
      {label}
    </Button>
  );
}

function TestRow({ listing }: { listing: FoundListing | TestedListing }) {
  const now = useNow();
  const matched = "matchedTerms" in listing ? listing.matchedTerms : [];
  return (
    <li className="flex gap-3 py-2">
      <div className="size-14 shrink-0 overflow-hidden rounded-md bg-muted">
        {listing.imageUrl ? <img src={listing.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" /> : <ImageOff className="m-auto mt-4 size-5 text-muted-foreground" />}
      </div>
      <div className="min-w-0 flex-1">
        <a href={listing.url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 text-sm hover:underline">
          {listing.title}
        </a>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{listing.price ? formatMoney(listing.price) : "—"}</span>
          {!listing.listedAtEstimated && <span>{timeAgo(listing.listedAt, now)}</span>}
          {listing.condition && <span>{listing.condition}</span>}
          {matched.map((term) => (
            <Badge key={term} variant="outline" className="border-primary/40 text-primary">
              {term}
            </Badge>
          ))}
        </div>
      </div>
    </li>
  );
}
