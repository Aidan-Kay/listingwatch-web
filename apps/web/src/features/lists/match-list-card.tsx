import type { MatchList, Search } from "@listingwatch/shared/schemas";
import { Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useDeleteMatchList, useSaveMatchList } from "@/api/hooks";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { plural } from "@/lib/format";
import { UsedBySearches } from "./used-by-searches";

/** How many terms the card previews; the rest are summed up by the count. */
const PREVIEW_TERMS = 8;

/** One match list: its name, a taste of its terms, the searches using it, and its actions. */
export function MatchListCard({ list, usedBy, onEdit }: { list: MatchList; usedBy: readonly Search[]; onEdit: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const remove = useDeleteMatchList();
  const save = useSaveMatchList();
  const duplicate = (): void => save.mutate({ id: null, input: { name: `${list.name} (copy)`, terms: list.terms } });

  return (
    <article className="flex gap-3 rounded-xl border bg-card p-3 pl-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h3 className="truncate font-medium">
          <button type="button" onClick={onEdit} className="rounded-sm text-left outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
            {list.name}
          </button>
        </h3>
        <TermsPreview terms={list.terms} />
        <UsedBySearches searches={usedBy} />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${list.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={duplicate}>
            <Copy /> Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete “${list.name}”?`}
        description={
          usedBy.length > 0 ? `It's detached from ${plural(usedBy.length, "search", "searches")}, which will then keep every listing they find.` : "It isn't used by any search."
        }
        confirmLabel="Delete list"
        onConfirm={() => remove.mutate(list.id)}
      />
    </article>
  );
}

function TermsPreview({ terms }: { terms: readonly string[] }) {
  if (terms.length === 0) return <p className="text-sm text-muted-foreground">No terms yet</p>;
  return (
    <p className="truncate text-sm text-muted-foreground">
      <span className="font-medium text-foreground">{plural(terms.length, "term")}</span>
      {" · "}
      {terms.slice(0, PREVIEW_TERMS).join(" · ")}
    </p>
  );
}
