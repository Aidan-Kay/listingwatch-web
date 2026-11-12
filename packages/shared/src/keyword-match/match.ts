import type { CompiledList, Variant } from "./compile.ts";
import { tokensOf } from "./normalise.ts";

/**
 * A title prepared once for matching against many terms.
 *
 * Matching rules for a variant without phrases (either is enough):
 *   1. every token appears somewhere in the title, in any order — favours
 *      recall: "Paper Mario Thousand Year Door" matches "Paper Mario The
 *      Thousand Year Door";
 *   2. the squashed variant lines up with whole squashed title tokens, which
 *      catches spacing variants ("FIFA 21" / "Fifa21") without letting
 *      "Final Fantasy VII" match "Final Fantasy VIII".
 * With phrases, each phrase must satisfy rule 2 (contiguous, ordered) and the
 * loose words must satisfy rule 1.
 */
export class PreparedTitle {
  private readonly tokenSet: ReadonlySet<string>;
  private readonly squashed: string;
  private readonly starts: ReadonlySet<number>;
  private readonly ends: ReadonlySet<number>;

  constructor(title: string) {
    const tokens = tokensOf(title);
    this.tokenSet = new Set(tokens);
    this.squashed = tokens.join("");
    const starts = new Set<number>();
    const ends = new Set<number>();
    let offset = 0;
    for (const token of tokens) {
      starts.add(offset);
      offset += token.length;
      ends.add(offset);
    }
    this.starts = starts;
    this.ends = ends;
  }

  get isEmpty(): boolean {
    return this.squashed === "";
  }

  hits(variant: Variant): boolean {
    if (variant.phrases.length === 0) {
      return this.hasAllTokens(variant.tokens) || this.hasWholeTokenRun(variant.squashed);
    }
    return (
      variant.phrases.every((phrase) => this.hasWholeTokenRun(phrase)) &&
      (variant.tokens.length === 0 || this.hasAllTokens(variant.tokens))
    );
  }

  private hasAllTokens(tokens: readonly string[]): boolean {
    return tokens.length > 0 && tokens.every((token) => this.tokenSet.has(token));
  }

  private hasWholeTokenRun(needle: string): boolean {
    if (needle === "") return false;
    for (let at = this.squashed.indexOf(needle); at !== -1; at = this.squashed.indexOf(needle, at + 1)) {
      if (this.starts.has(at) && this.ends.has(at + needle.length)) return true;
    }
    return false;
  }
}

/** The terms (as written) that match `title`, deduplicated, in list order. */
export function matchTitle(title: string, lists: readonly CompiledList[]): string[] {
  const prepared = new PreparedTitle(title);
  if (prepared.isEmpty) return [];
  const matched = new Set<string>();
  for (const list of lists) {
    for (const term of list.terms) {
      if (term.variants.some((v) => prepared.hits(v)) && !term.excludes.some((v) => prepared.hits(v))) {
        matched.add(term.raw);
      }
    }
  }
  return [...matched];
}
