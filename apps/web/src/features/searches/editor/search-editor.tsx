import type { Search } from "@listingwatch/shared/schemas";
import { useRef, useState, type RefObject } from "react";
import { toast } from "sonner";
import { useSaveSearch } from "@/api/hooks";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { draftFromSearch, draftToInput, emptyDraft, type DraftErrors, type SearchDraft } from "./draft";
import { AdvancedSection, BasicsSection, MarketplaceFiltersSection, NotificationsSection, ResultFiltersSection, UrlImportSection } from "./editor-sections";
import { TestPanel } from "./test-panel";

/** Add or edit a search in a side sheet (full screen on phones). */
export function SearchEditor({ open, search, onClose }: { open: boolean; search: Search | null; onClose: () => void }) {
  // Every way of closing (the X, Escape, Cancel) asks the editor first, so unsaved changes aren't lost silently.
  const requestClose = useRef<() => void>(onClose);
  return (
    <Sheet open={open} onOpenChange={(next) => !next && requestClose.current()}>
      <SheetContent className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl" onInteractOutside={(e) => e.preventDefault()}>
        {open && <EditorBody key={search?.id ?? "new"} search={search} onClose={onClose} closeGuard={requestClose} />}
      </SheetContent>
    </Sheet>
  );
}

function EditorBody({ search, onClose, closeGuard }: { search: Search | null; onClose: () => void; closeGuard: RefObject<() => void> }) {
  const [initial] = useState<SearchDraft>(() => (search ? draftFromSearch(search) : emptyDraft()));
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const save = useSaveSearch();
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const editing = search !== null;

  const update = (patch: Partial<SearchDraft>): void => {
    setDraft((current) => ({ ...current, ...patch }));
    setErrors((current) => (Object.keys(current).length > 0 ? {} : current));
  };
  const validated = () => {
    const result = draftToInput(draft);
    if (!result.ok) {
      setErrors(result.errors);
      return null;
    }
    return result.input;
  };
  const submit = (): void => {
    const input = validated();
    if (!input) return;
    save.mutate(
      { id: search?.id ?? null, config: input },
      {
        onSuccess: () => {
          toast.success(editing ? "Search saved" : "Search added. Its first poll starts now.");
          onClose();
        },
      },
    );
  };
  const requestClose = (): void => (dirty ? setConfirmDiscard(true) : onClose());
  closeGuard.current = requestClose;

  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="border-b">
        <SheetTitle>{editing ? `Edit “${search.name}”` : "Add a search"}</SheetTitle>
        <SheetDescription>{editing ? "Changes apply from the next poll." : "Watch an eBay or Vinted search for new listings."}</SheetDescription>
      </SheetHeader>
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
        <UrlImportSection draft={draft} onImport={(next) => setDraft(next)} editing={editing} />
        <BasicsSection draft={draft} update={update} errors={errors} editing={editing} />
        <MarketplaceFiltersSection draft={draft} update={update} errors={errors} />
        <ResultFiltersSection draft={draft} update={update} errors={errors} />
        <NotificationsSection draft={draft} update={update} errors={errors} />
        <Collapsible defaultOpen={draft.minInterval !== "" || draft.maxInterval !== ""}>
          <CollapsibleTrigger asChild>
            <Button variant="link" className="px-0">
              Polling interval
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <AdvancedSection draft={draft} update={update} errors={errors} />
          </CollapsibleContent>
        </Collapsible>
        <TestPanel getInput={validated} />
      </div>
      <SheetFooter className="flex-row justify-end border-t">
        {Object.keys(errors).length > 0 && <p className="mr-auto self-center text-sm text-destructive">Fix the highlighted fields</p>}
        <Button variant="ghost" onClick={requestClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={save.isPending}>
          {save.isPending && <Spinner />}
          {editing ? "Save" : "Add search"}
        </Button>
      </SheetFooter>
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard your changes?"
        description="The changes you made to this search haven't been saved."
        confirmLabel="Discard"
        onConfirm={onClose}
      />
    </div>
  );
}
