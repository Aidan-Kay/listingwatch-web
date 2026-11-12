import { SOURCE_LABELS, SOURCES, type Source } from "@listingwatch/shared/marketplaces";
import type { Search } from "@listingwatch/shared/schemas";
import { Plus, SearchIcon, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useApiUsage, useSearches } from "@/api/hooks";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { plural } from "@/lib/format";
import { SearchEditor } from "./editor/search-editor";
import { SearchCard } from "./search-card";

/** Saved searches, grouped by marketplace, failing ones first. The editor opens via ?new=1 or ?edit=<id>. */
export function SearchesPage() {
  const searches = useSearches();
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState("");
  const [source, setSource] = useState<"all" | Source>("all");
  const editingId = params.get("edit");
  const editorOpen = params.has("new") || editingId !== null;
  const editing = editingId ? (searches.data?.find((s) => s.id === editingId) ?? null) : null;

  const openEditor = (id: string | null): void => setParams(id ? { edit: id } : { new: "1" });
  const closeEditor = (): void => setParams({}, { replace: true });

  const groups = useMemo(() => groupSearches(searches.data ?? [], text, source), [searches.data, text, source]);
  const total = searches.data?.length ?? 0;

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        title="Searches"
        description={searches.data ? `${plural(total, "search", "searches")}, ${searches.data.filter((s) => s.enabled).length} polling` : "Loading…"}
        actions={
          <Button onClick={() => openEditor(null)}>
            <Plus /> Add search
          </Button>
        }
      />
      {total > 3 && (
        <div className="flex flex-wrap gap-2 px-4 pb-3 md:px-6">
          <InputGroup className="max-w-xs flex-1">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput value={text} onChange={(e) => setText(e.target.value)} placeholder="Find a search" aria-label="Find a search" />
          </InputGroup>
          <ToggleGroup type="single" variant="outline" value={source} onValueChange={(v) => v && setSource(v as typeof source)} aria-label="Marketplace">
            <ToggleGroupItem value="all">All</ToggleGroupItem>
            {SOURCES.map((s) => (
              <ToggleGroupItem key={s} value={s}>
                {SOURCE_LABELS[s]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}
      <div className="flex flex-1 flex-col gap-6 px-4 pb-6 md:px-6">
        {searches.isLoading ? (
          <Skeleton className="h-20 rounded-xl" />
        ) : total === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchIcon />
              </EmptyMedia>
              <EmptyTitle>No searches yet</EmptyTitle>
              <EmptyDescription>Add a search, or paste the link of a search page from eBay or Vinted.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => openEditor(null)}>
                <Plus /> Add search
              </Button>
            </EmptyContent>
          </Empty>
        ) : groups.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchX />
              </EmptyMedia>
              <EmptyTitle>No searches match</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          groups.map((group) => (
            <section key={group.source} className="flex flex-col gap-2">
              <h2 className="flex items-baseline gap-2 text-sm font-semibold">
                {SOURCE_LABELS[group.source]} <span className="font-normal text-muted-foreground">{group.searches.length}</span>
                {group.source === "ebay" && <EbayUsageHint />}
              </h2>
              {group.searches.map((search) => (
                <SearchCard key={search.id} search={search} onEdit={() => openEditor(search.id)} />
              ))}
            </section>
          ))
        )}
      </div>
      <SearchEditor open={editorOpen && (editingId === null || editing !== null)} search={editing} onClose={closeEditor} />
    </div>
  );
}

/** Today's eBay API calls against the limit, warning when the searches would use more than it. */
function EbayUsageHint() {
  const usage = useApiUsage();
  if (!usage.data) return null;
  const { calls, limit, projectedDaily } = usage.data;
  const over = projectedDaily > limit;
  return (
    <span className={over ? "ml-auto text-xs font-normal text-amber-600 dark:text-amber-400" : "ml-auto text-xs font-normal text-muted-foreground"}>
      {calls.toLocaleString()} / {limit.toLocaleString()} API calls today
      {over && ` · these searches need about ${projectedDaily.toLocaleString()} a day`}
    </span>
  );
}

function groupSearches(searches: readonly Search[], text: string, source: "all" | Source): { source: Source; searches: Search[] }[] {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = searches.filter((s) => (source === "all" || s.source === source) && words.every((w) => `${s.name} ${s.keywords}`.toLowerCase().includes(w)));
  const order = (s: Search): number => (s.enabled && s.status.lastError ? 0 : s.enabled ? 1 : 2);
  return SOURCES.map((src) => ({
    source: src,
    searches: matches.filter((s) => s.source === src).sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name)),
  })).filter((group) => group.searches.length > 0);
}
