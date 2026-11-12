import type { MatchList } from "@listingwatch/shared/schemas";
import { ListChecks, Plus, SearchIcon, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useMatchLists, useSearches } from "@/api/hooks";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { plural } from "@/lib/format";
import { MatchListCard } from "./match-list-card";
import { MatchListEditor } from "./match-list-editor";
import { searchesUsingList } from "./used-by-searches";

/**
 * Match lists: reusable term lists a search can require titles to match. Laid
 * out like the Searches page: one card per list, edited in a side sheet that
 * opens via ?new=1 or ?edit=<id>.
 */
export function MatchListsPage() {
  const lists = useMatchLists();
  const searches = useSearches();
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState("");
  const editingId = params.get("edit");
  const editing = editingId ? (lists.data?.find((l) => l.id === editingId) ?? null) : null;
  const editorOpen = params.has("new") || editing !== null;

  const openEditor = (id: string | null): void => setParams(id ? { edit: id } : { new: "1" });
  const closeEditor = (): void => setParams({}, { replace: true });

  const total = lists.data?.length ?? 0;
  const shown = useMemo(() => findLists(lists.data ?? [], text), [lists.data, text]);

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        title="Match lists"
        description={lists.data ? `${plural(total, "list")}. A search using a list keeps only listings whose title matches one of its terms.` : "Loading…"}
        actions={
          <Button onClick={() => openEditor(null)}>
            <Plus /> New list
          </Button>
        }
      />
      {total > 3 && (
        <div className="px-4 pb-3 md:px-6">
          <InputGroup className="max-w-xs">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput value={text} onChange={(e) => setText(e.target.value)} placeholder="Find a list or term" aria-label="Find a list or term" />
          </InputGroup>
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 px-4 pb-6 md:px-6">
        {lists.isLoading ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : total === 0 ? (
          <NoLists onCreate={() => openEditor(null)} />
        ) : shown.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchX />
              </EmptyMedia>
              <EmptyTitle>No lists match</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          shown.map((list) => <MatchListCard key={list.id} list={list} usedBy={searchesUsingList(searches.data, list.id)} onEdit={() => openEditor(list.id)} />)
        )}
      </div>
      <MatchListEditor open={editorOpen} list={editing} onClose={closeEditor} />
    </div>
  );
}

function NoLists({ onCreate }: { onCreate: () => void }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ListChecks />
        </EmptyMedia>
        <EmptyTitle>No match lists yet</EmptyTitle>
        <EmptyDescription>For example, a list of the games you collect, attached to a search for a whole console's games category.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={onCreate}>
          <Plus /> New list
        </Button>
      </EmptyContent>
    </Empty>
  );
}

/** Lists whose name or any term contains every word typed, sorted by name. */
function findLists(lists: readonly MatchList[], text: string): MatchList[] {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  return lists
    .filter((list) => {
      const haystack = `${list.name}\n${list.terms.join("\n")}`.toLowerCase();
      return words.every((word) => haystack.includes(word));
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
