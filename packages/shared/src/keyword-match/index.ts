/**
 * Match lists: the term grammar, compiler and matcher. One implementation used
 * by the server's polling pipeline and the web app's list editor, so the
 * editor's term count and warnings always describe the parse that decides
 * which listings match.
 */
import { analyseTerm, type TermAnalysis } from "./compile.ts";
import { splitTerms } from "./split-terms.ts";

export { normalise } from "./normalise.ts";
export { splitTerms, cleanTerms } from "./split-terms.ts";
export { parseTerm, type TermDiagnostic, type DiagnosticCode } from "./parse.ts";
export {
  analyseTerm,
  compileList,
  countTerms,
  ListCompiler,
  MAX_TERM_VARIANTS,
  type CompiledList,
  type CompiledTerm,
  type MatchListSource,
  type TermAnalysis,
  type Variant,
} from "./compile.ts";
export { matchTitle, PreparedTitle } from "./match.ts";

export interface ListTextAnalysis {
  readonly terms: readonly TermAnalysis[];
  /** Terms that will actually be used for matching. */
  readonly usableCount: number;
  /** Terms with at least one diagnostic. */
  readonly flagged: readonly TermAnalysis[];
}

/** Analyse the editor's raw text: what each term compiles to and what's wrong with it. */
export function analyseListText(text: string): ListTextAnalysis {
  const terms = splitTerms(text).map(analyseTerm);
  return {
    terms,
    usableCount: terms.filter((t) => t.compiled !== null).length,
    flagged: terms.filter((t) => t.diagnostics.length > 0),
  };
}
