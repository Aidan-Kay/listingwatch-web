/**
 * Parser for one match-list term.
 *
 * Grammar (informal):
 *
 *   term       := ( exclusion | item )*
 *   exclusion  := "-" chunk            only at the top level, where "-" opens a
 *                                      word and is followed by a non-space
 *   chunk      := item+ up to the next top-level whitespace
 *   item       := phrase | group | text
 *   phrase     := '"' ... '"'          contiguous, ordered words
 *   group      := "(" option ( ("|" | ",") option )* ")"   options may nest
 *
 * Malformed input degrades rather than failing: an unterminated quote or an
 * unclosed "(" becomes plain text, so a typo costs the user as few listings as
 * possible. Each degradation is reported as a diagnostic for the list editor.
 */

export type TermNode =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "phrase"; readonly value: string }
  | { readonly kind: "group"; readonly options: readonly TermNode[][] };

export type DiagnosticCode = "unterminated-quote" | "unclosed-group" | "too-many-variants" | "only-exclusions" | "matches-nothing";

export interface TermDiagnostic {
  readonly code: DiagnosticCode;
  readonly message: string;
}

export interface ParsedTerm {
  readonly include: TermNode[];
  readonly excludes: TermNode[][];
  readonly diagnostics: TermDiagnostic[];
}

const isSpace = (ch: string | undefined): boolean => ch !== undefined && /\s/.test(ch);

export function parseTerm(text: string): ParsedTerm {
  return new TermParser(text).parse();
}

class TermParser {
  private readonly text: string;
  private readonly diagnostics: TermDiagnostic[] = [];
  private i = 0;

  constructor(text: string) {
    this.text = text;
  }

  parse(): ParsedTerm {
    const include: TermNode[] = [];
    const excludes: TermNode[][] = [];
    while (this.i < this.text.length) {
      if (this.atExclusion()) {
        this.i++;
        excludes.push(this.parseChunk());
      } else {
        include.push(this.parseItem("top"));
      }
    }
    return { include: mergeText(include), excludes, diagnostics: this.diagnostics };
  }

  /** A "-" opening a word and followed by a non-space ("Spider-Man" and "a - b" are not exclusions). */
  private atExclusion(): boolean {
    const { text, i } = this;
    return text[i] === "-" && (i === 0 || isSpace(text[i - 1])) && text[i + 1] !== undefined && !isSpace(text[i + 1]);
  }

  /** The body of an exclusion: everything up to the next top-level whitespace. */
  private parseChunk(): TermNode[] {
    const nodes: TermNode[] = [];
    while (this.i < this.text.length && !isSpace(this.text[this.i])) {
      nodes.push(this.parseItem("chunk"));
    }
    return mergeText(nodes);
  }

  private parseItem(context: "top" | "chunk" | "group"): TermNode {
    const ch = this.text[this.i];
    if (ch === '"') return this.parsePhrase();
    if (ch === "(") return this.parseGroup();
    return this.parseText(context);
  }

  private parsePhrase(): TermNode {
    const close = this.text.indexOf('"', this.i + 1);
    if (close === -1) {
      const rest = this.text.slice(this.i + 1);
      this.i = this.text.length;
      this.report("unterminated-quote", "A quote is never closed, so its words are matched loosely instead of as a phrase");
      return { kind: "text", value: ` ${rest} ` };
    }
    const value = this.text.slice(this.i + 1, close);
    this.i = close + 1;
    return { kind: "phrase", value };
  }

  private parseGroup(): TermNode {
    const start = this.i;
    this.i++; // past "("
    const options: TermNode[][] = [];
    let current: TermNode[] = [];
    while (this.i < this.text.length) {
      const ch = this.text[this.i];
      if (ch === ")") {
        this.i++;
        options.push(current);
        return { kind: "group", options: options.map(mergeText) };
      }
      if (ch === "|" || ch === ",") {
        this.i++;
        options.push(current);
        current = [];
        continue;
      }
      current.push(this.parseItem("group"));
    }
    // Never closed: read the whole remainder as plain text, as typed.
    this.i = this.text.length;
    this.report("unclosed-group", 'A "(" is never closed, so the rest of the term is matched as plain words');
    return { kind: "text", value: this.text.slice(start) };
  }

  /** A run of ordinary characters, stopping at whatever ends it in this context. */
  private parseText(context: "top" | "chunk" | "group"): TermNode {
    let value = "";
    while (this.i < this.text.length) {
      const ch = this.text[this.i]!;
      if (ch === '"' || ch === "(") break;
      if (context === "group" && (ch === ")" || ch === "|" || ch === ",")) break;
      if (context === "chunk" && isSpace(ch)) break;
      if (context === "top" && value.length > 0 && this.atExclusion()) break;
      value += ch;
      this.i++;
    }
    if (value === "") {
      // A stray ")" at the top level: consume it as text so parsing advances.
      value = this.text[this.i] ?? "";
      this.i++;
    }
    return { kind: "text", value };
  }

  private report(code: DiagnosticCode, message: string): void {
    if (!this.diagnostics.some((d) => d.code === code)) this.diagnostics.push({ code, message });
  }
}

/** Join adjacent text nodes so expansion sees one run per stretch of words. */
function mergeText(nodes: TermNode[]): TermNode[] {
  const merged: TermNode[] = [];
  for (const node of nodes) {
    const last = merged.at(-1);
    if (node.kind === "text" && last?.kind === "text") {
      merged[merged.length - 1] = { kind: "text", value: last.value + node.value };
    } else {
      merged.push(node);
    }
  }
  return merged;
}
