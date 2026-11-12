import { cleanTerms, splitTerms } from "@listingwatch/shared/keyword-match";
import type { MatchList } from "@listingwatch/shared/schemas";
import { FileUp, TriangleAlert } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useBlocker } from "react-router";
import { toast } from "sonner";
import { useSaveMatchList, useSearches } from "@/api/hooks";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { plural } from "@/lib/format";
import { SyntaxHelpButton } from "./syntax-help";
import { analyseTermLines, type TermLinesAnalysis } from "./term-lines";
import { TermsEditor, type TermsEditorHandle } from "./terms-editor";
import { searchesUsingList, UsedBySearches } from "./used-by-searches";

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** Create or edit a match list in a side sheet (full screen on phones), like the search editor. */
export function MatchListEditor({ open, list, onClose }: { open: boolean; list: MatchList | null; onClose: () => void }) {
  // Every way of closing (the X, Escape, Cancel) asks the editor first, so unsaved changes aren't lost silently.
  const requestClose = useRef<() => void>(onClose);
  return (
    <Sheet open={open} onOpenChange={(next) => !next && requestClose.current()}>
      <SheetContent
        className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
        onInteractOutside={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => {
          // A new list starts at its name; an existing one opens without focusing a field, so a phone's keyboard doesn't cover the terms.
          if (list === null) return;
          e.preventDefault();
          (e.currentTarget as HTMLElement).focus();
        }}
      >
        {open && <EditorBody key={list?.id ?? "new"} list={list} onClose={onClose} closeGuard={requestClose} />}
      </SheetContent>
    </Sheet>
  );
}

function EditorBody({ list, onClose, closeGuard }: { list: MatchList | null; onClose: () => void; closeGuard: RefObject<() => void> }) {
  const initial = useMemo(() => ({ name: list?.name ?? "", text: list?.terms.join("\n") ?? "" }), [list]);
  const [name, setName] = useState(initial.name);
  const [text, setText] = useState(initial.text);
  const [nameError, setNameError] = useState<string | null>(null);
  const [caretLine, setCaretLine] = useState<number | null>(null);
  const terms = useRef<TermsEditorHandle>(null);
  const save = useSaveMatchList();
  const analysis = useTermAnalysis(text);
  const dirty = name !== initial.name || text !== initial.text;
  const guard = useDiscardGuard(dirty, onClose);
  closeGuard.current = guard.requestClose;

  const submit = (): void => {
    if (name.trim() === "") return setNameError("Give the list a name");
    save.mutate(
      { id: list?.id ?? null, input: { name, terms: splitTerms(text) } },
      {
        onSuccess: () => {
          toast.success(list ? "List saved. Searches using it will re-check their listings." : "List created. Attach it to a search to use it.");
          guard.close();
        },
      },
    );
  };

  return (
    <div className="flex h-full flex-col">
      <EditorHeader list={list} name={name} nameError={nameError} onNameChange={(value) => (setName(value), setNameError(null))} />
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <FieldLabel htmlFor="list-terms">Terms</FieldLabel>
          <ProblemsButton analysis={analysis} onJump={(line) => terms.current?.jumpToLine(line)} />
          <div className="ml-auto flex items-center gap-1">
            <SyntaxHelpButton />
            <ImportTermsButton onTerms={(added) => setText((current) => cleanTerms([...splitTerms(current), ...added]).join("\n"))} />
          </div>
        </div>
        <TermsEditor ref={terms} id="list-terms" value={text} onChange={setText} problems={analysis.problems} onCaretLineChange={setCaretLine} />
        <CaretLineStatus analysis={analysis} caretLine={caretLine} />
      </div>
      <SheetFooter className="flex-row items-center justify-end border-t">
        <p className="mr-auto text-sm text-muted-foreground">{plural(analysis.usableCount, "usable term")}</p>
        <Button variant="ghost" onClick={guard.requestClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={save.isPending || (!dirty && list !== null)}>
          {save.isPending && <Spinner />}
          {list ? "Save" : "Create list"}
        </Button>
      </SheetFooter>
      <ConfirmDialog
        open={guard.confirming}
        onOpenChange={(open) => !open && guard.stay()}
        title="Discard your changes?"
        description="The changes you made to this list haven't been saved."
        confirmLabel="Discard"
        onConfirm={guard.discard}
      />
    </div>
  );
}

function EditorHeader({ list, name, nameError, onNameChange }: { list: MatchList | null; name: string; nameError: string | null; onNameChange: (name: string) => void }) {
  const searches = useSearches();
  return (
    <SheetHeader className="gap-3 border-b">
      <div>
        <SheetTitle>{list ? "Edit match list" : "New match list"}</SheetTitle>
        <SheetDescription>Searches using this list keep only listings whose title matches one of its terms.</SheetDescription>
      </div>
      <Field data-invalid={nameError !== null}>
        <FieldLabel htmlFor="list-name" className="sr-only">
          Name
        </FieldLabel>
        <Input id="list-name" value={name} onChange={(e) => onNameChange(e.target.value)} placeholder="List name, e.g. PS2 games I collect" aria-invalid={nameError !== null} className="h-10 text-base font-medium" />
        {nameError && <FieldError>{nameError}</FieldError>}
      </Field>
      {list && <UsedBySearches searches={searchesUsingList(searches.data, list.id)} />}
    </SheetHeader>
  );
}

/** "2 problems": each click jumps to the next problem line. */
function ProblemsButton({ analysis, onJump }: { analysis: TermLinesAnalysis; onJump: (line: number) => void }) {
  const next = useRef(0);
  const count = analysis.problems.length;
  if (count === 0) return null;
  const jump = (): void => {
    const problem = analysis.problems[next.current % count]!;
    next.current += 1;
    onJump(problem.line);
  };
  return (
    <Button variant="ghost" size="xs" className="text-amber-600 dark:text-amber-400" onClick={jump} title="Go to the next problem">
      <TriangleAlert /> {plural(count, "problem")}
    </Button>
  );
}

/** The problem on the caret's line, or a hint about the syntax. */
function CaretLineStatus({ analysis, caretLine }: { analysis: TermLinesAnalysis; caretLine: number | null }) {
  const problems = caretLine === null ? [] : analysis.problems.filter((p) => p.line === caretLine);
  if (caretLine === null || problems.length === 0) {
    return <p className="text-xs text-muted-foreground">One term per line, or separate terms with commas. Duplicates are removed when you save.</p>;
  }
  return (
    <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400" role="status">
      <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>
        Line {caretLine + 1}: {problems.map((p) => p.message).join("; ")}
      </span>
    </p>
  );
}

/** Analysis of the terms, deferred so typing in a long list stays smooth. */
function useTermAnalysis(text: string): TermLinesAnalysis {
  const deferred = useDeferredValue(text);
  return useMemo(() => analyseTermLines(deferred), [deferred]);
}

/** Read terms from a text or CSV file into the editor, to review before saving. */
function ImportTermsButton({ onTerms }: { onTerms: (terms: string[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const read = async (file: File): Promise<void> => {
    if (file.size > MAX_IMPORT_BYTES) return void toast.error("That file is over 5 MB");
    const terms = cleanTerms(splitTerms(await file.text()));
    onTerms(terms);
    toast.success(`Added ${plural(terms.length, "term")} from ${file.name}. Review them, then save.`);
  };
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => input.current?.click()}>
        <FileUp /> Import
      </Button>
      <input
        ref={input}
        type="file"
        accept=".txt,.csv,text/plain,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void read(file);
        }}
      />
    </>
  );
}

/**
 * Asks before unsaved changes are thrown away: by Cancel, the sheet's X or
 * Escape, the browser's back button, or closing the tab.
 */
function useDiscardGuard(dirty: boolean, onClose: () => void) {
  const [asking, setAsking] = useState(false);
  const closing = useRef(false);
  const blocker = useBlocker(() => dirty && !closing.current);
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent): void => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const close = (): void => {
    closing.current = true;
    onClose();
  };
  return {
    close,
    requestClose: (): void => (dirty ? setAsking(true) : close()),
    confirming: asking || blocker.state === "blocked",
    discard: (): void => {
      setAsking(false);
      if (blocker.state === "blocked") {
        closing.current = true;
        blocker.proceed();
      } else close();
    },
    stay: (): void => {
      setAsking(false);
      if (blocker.state === "blocked") blocker.reset();
    },
  };
}
