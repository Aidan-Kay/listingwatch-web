import { useImperativeHandle, useMemo, useRef, type Ref } from "react";
import { lineAt, lineRange, type TermProblem } from "./term-lines";

/** Matches the textarea's `leading-6` and `py-2`, so gutter rows line up with text lines. */
const LINE_HEIGHT_PX = 24;
const PADDING_TOP_PX = 8;

export interface TermsEditorHandle {
  /** Select a line and scroll it to the middle of the box. */
  jumpToLine: (line: number) => void;
}

/**
 * A plain textarea with a line-number gutter. Lines with a problem are marked
 * in the gutter. Lines don't wrap, so each gutter row stays beside its line.
 * The gutter is one text block plus a marker per problem, so a list of
 * thousands of terms stays cheap to draw.
 */
export function TermsEditor({
  id,
  value,
  onChange,
  problems,
  onCaretLineChange,
  ref,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  problems: readonly TermProblem[];
  onCaretLineChange: (line: number) => void;
  ref?: Ref<TermsEditorHandle>;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const lineCount = useMemo(() => value.split("\n").length, [value]);
  const numbers = useMemo(() => Array.from({ length: lineCount }, (_, i) => i + 1).join("\n"), [lineCount]);
  const problemLines = useMemo(() => [...new Set(problems.map((p) => p.line))], [problems]);

  useImperativeHandle(ref, () => ({
    jumpToLine: (line) => {
      const element = textarea.current;
      if (!element) return;
      const { start, end } = lineRange(element.value, line);
      element.focus();
      element.setSelectionRange(start, end);
      element.scrollTop = Math.max(0, line * LINE_HEIGHT_PX - element.clientHeight / 2);
      onCaretLineChange(line);
    },
  }));

  const reportCaret = (): void => {
    if (textarea.current) onCaretLineChange(lineAt(textarea.current.value, textarea.current.selectionStart));
  };

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border bg-muted/20 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
      <div ref={gutter} className="relative shrink-0 overflow-hidden border-r bg-muted/40" aria-hidden>
        <pre className="min-w-10 px-2 pt-2 pb-12 text-right font-mono text-xs leading-6 text-muted-foreground select-none">{numbers}</pre>
        {problemLines.map((line) => (
          <span key={line} className="absolute inset-x-0 bg-amber-500/25" style={{ top: PADDING_TOP_PX + line * LINE_HEIGHT_PX, height: LINE_HEIGHT_PX }}>
            <span className="absolute inset-y-1 left-0 w-0.5 rounded-r bg-amber-500" />
          </span>
        ))}
      </div>
      <textarea
        ref={textarea}
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          reportCaret();
        }}
        onSelect={reportCaret}
        onScroll={(e) => gutter.current && (gutter.current.scrollTop = e.currentTarget.scrollTop)}
        wrap="off"
        spellCheck={false}
        placeholder={'One term per line, for example:\nFinal Fantasy (7|VII)\n"Legend of Zelda" -"Breath of the Wild"'}
        className="min-w-0 flex-1 resize-none overflow-auto bg-transparent px-3 py-2 font-mono text-sm leading-6 whitespace-pre outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}
