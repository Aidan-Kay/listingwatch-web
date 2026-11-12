import { analyseListText } from "@listingwatch/shared/keyword-match";

export interface TermProblem {
  /** Zero-based line in the editor text. */
  readonly line: number;
  readonly term: string;
  readonly message: string;
}

export interface TermLinesAnalysis {
  /** Terms that will actually be used for matching. */
  readonly usableCount: number;
  /** Problems in line order, so the editor can mark and jump to each one. */
  readonly problems: readonly TermProblem[];
}

/**
 * Analyse the editor's text one line at a time, so every problem points at the
 * line that caused it. A newline always ends a term, so analysing lines
 * separately gives the same terms as analysing the whole text.
 */
export function analyseTermLines(text: string): TermLinesAnalysis {
  let usableCount = 0;
  const problems: TermProblem[] = [];
  text.split(/\r\n|\r|\n/).forEach((line, index) => {
    if (line.trim() === "") return;
    const analysis = analyseListText(line);
    usableCount += analysis.usableCount;
    for (const term of analysis.flagged) {
      problems.push({ line: index, term: term.raw, message: term.diagnostics.map((d) => d.message).join("; ") });
    }
  });
  return { usableCount, problems };
}

/** Character range of a zero-based line, for selecting it in a textarea. */
export function lineRange(text: string, line: number): { start: number; end: number } {
  const lines = text.split("\n");
  const index = Math.max(0, Math.min(line, lines.length - 1));
  const start = lines.slice(0, index).reduce((sum, l) => sum + l.length + 1, 0);
  return { start, end: start + (lines[index]?.length ?? 0) };
}

/** Zero-based line holding a character offset. */
export function lineAt(text: string, offset: number): number {
  let line = 0;
  for (let i = 0; i < offset && i < text.length; i++) if (text[i] === "\n") line++;
  return line;
}
