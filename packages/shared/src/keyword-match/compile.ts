import { tokensOf } from "./normalise.ts";
import { parseTerm, type TermDiagnostic, type TermNode } from "./parse.ts";

/** Ceiling on the variants one term may expand to, so alternations can't blow up a big list. */
export const MAX_TERM_VARIANTS = 64;

/**
 * One concrete way a term can match. `tokens` are the loose words (order-free),
 * `squashed` is those words joined with no spaces (catches spacing variants),
 * and each phrase is held squashed because adjacency is checked on the
 * squashed title.
 */
export interface Variant {
  readonly tokens: readonly string[];
  readonly squashed: string;
  readonly phrases: readonly string[];
}

export interface CompiledTerm {
  /** The term as the user wrote it, reported back when it matches. */
  readonly raw: string;
  readonly variants: readonly Variant[];
  readonly excludes: readonly Variant[];
}

export interface TermAnalysis {
  readonly raw: string;
  /** Null when the term can never match anything and is ignored. */
  readonly compiled: CompiledTerm | null;
  readonly diagnostics: readonly TermDiagnostic[];
}

export interface CompiledList {
  readonly id: string;
  readonly version: number;
  readonly terms: readonly CompiledTerm[];
}

export interface MatchListSource {
  readonly id: string;
  readonly version: number;
  readonly terms: readonly string[];
}

/** Compile one term, reporting why it was weakened or dropped. */
export function analyseTerm(raw: string): TermAnalysis {
  const parsed = parseTerm(raw);
  const diagnostics = [...parsed.diagnostics];
  const includeExpansion = expand(parsed.include);
  const excludeExpansions = parsed.excludes.map(expand);
  if (includeExpansion.truncated || excludeExpansions.some((e) => e.truncated)) {
    diagnostics.push({ code: "too-many-variants", message: `Expands to more than ${MAX_TERM_VARIANTS} variants; the rest are ignored` });
  }
  const variants = dedupe(includeExpansion.variants.map(toVariant).filter(isUsable));
  const excludes = dedupe(excludeExpansions.flatMap((e) => e.variants.map(toVariant)).filter(isUsable));
  if (variants.length === 0) {
    const onlyExclusions = parsed.excludes.length > 0;
    diagnostics.push(
      onlyExclusions
        ? { code: "only-exclusions", message: "Has exclusions but nothing to match, so it's ignored" }
        : { code: "matches-nothing", message: "Has no words to match, so it's ignored" },
    );
    return { raw: raw.trim(), compiled: null, diagnostics };
  }
  return { raw: raw.trim(), compiled: { raw: raw.trim(), variants, excludes }, diagnostics };
}

/**
 * Compile a whole list. Terms that can't match are dropped, and a term whose
 * variants (and exclusions) all repeat an earlier term's is dropped as a
 * duplicate, so "Mario Party" and "Mario Party -Jamboree" both survive.
 */
export function compileList(list: MatchListSource): CompiledList {
  const seen = new Set<string>();
  const terms: CompiledTerm[] = [];
  for (const raw of list.terms) {
    const { compiled } = analyseTerm(raw);
    if (compiled === null) continue;
    const exclusionSignature = compiled.excludes.map(variantKey).join("|");
    const fresh = compiled.variants.filter((variant) => {
      const key = `${variantKey(variant)}|${exclusionSignature}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (fresh.length > 0) terms.push({ ...compiled, variants: fresh });
  }
  return { id: list.id, version: list.version, terms };
}

/**
 * Caches compiled lists by id, recompiling only when a list's version changes,
 * so a 2,000-term list is normalised on edit rather than on every poll.
 */
export class ListCompiler {
  private readonly cache = new Map<string, CompiledList>();

  compile(list: MatchListSource): CompiledList {
    const cached = this.cache.get(list.id);
    if (cached?.version === list.version) return cached;
    const compiled = compileList(list);
    this.cache.set(list.id, compiled);
    return compiled;
  }

  /** Compile the lists a search references. Missing ids contribute nothing. */
  compileAll(listIds: readonly string[], lists: readonly MatchListSource[]): CompiledList[] {
    const byId = new Map(lists.map((list) => [list.id, list]));
    return listIds.flatMap((id) => {
      const list = byId.get(id);
      return list ? [this.compile(list)] : [];
    });
  }

  forget(listId: string): void {
    this.cache.delete(listId);
  }
}

/** Number of usable terms. Zero means "don't filter", never "match nothing". */
export function countTerms(lists: readonly CompiledList[]): number {
  return lists.reduce((total, list) => total + list.terms.length, 0);
}

// ─── Expansion ───────────────────────────────────────────────────────────────

/** A flattened alternative: loose text pieces and phrases. */
interface Flat {
  readonly words: readonly string[];
  readonly phrases: readonly string[];
}

interface Expansion {
  readonly variants: Flat[];
  readonly truncated: boolean;
}

/** Expand every group (nested ones included) into concrete alternatives, capped. */
function expand(nodes: readonly TermNode[]): Expansion {
  let variants: Flat[] = [{ words: [], phrases: [] }];
  let truncated = false;
  for (const node of nodes) {
    const choices = alternativesOf(node);
    truncated ||= choices.truncated;
    const next: Flat[] = [];
    for (const prefix of variants) {
      for (const choice of choices.variants) {
        if (next.length === MAX_TERM_VARIANTS) {
          truncated = true;
          break;
        }
        next.push({ words: [...prefix.words, ...choice.words], phrases: [...prefix.phrases, ...choice.phrases] });
      }
    }
    variants = next;
  }
  return { variants, truncated };
}

function alternativesOf(node: TermNode): Expansion {
  switch (node.kind) {
    case "text":
      return { variants: [{ words: [node.value], phrases: [] }], truncated: false };
    case "phrase":
      return { variants: [{ words: [], phrases: [node.value] }], truncated: false };
    case "group": {
      // "()" offers no alternative at all, which would erase the whole term;
      // treat it as contributing nothing instead.
      const expansions = node.options.map(expand);
      const variants = expansions.flatMap((e) => e.variants).filter((flat) => !isEmptyFlat(flat));
      return {
        variants: variants.length > 0 ? variants : [{ words: [], phrases: [] }],
        truncated: expansions.some((e) => e.truncated),
      };
    }
  }
}

function isEmptyFlat(flat: Flat): boolean {
  return tokensOf(flat.words.join(" ")).length === 0 && flat.phrases.every((p) => tokensOf(p).length === 0);
}

function toVariant(flat: Flat): Variant {
  const tokens = tokensOf(flat.words.join(" "));
  const phrases = flat.phrases.map((phrase) => tokensOf(phrase).join("")).filter((p) => p !== "");
  return { tokens, squashed: tokens.join(""), phrases };
}

function isUsable(variant: Variant): boolean {
  return variant.tokens.length > 0 || variant.phrases.length > 0;
}

/** Normalised tokens are [a-z0-9] and phrases are squashed, so "#" can't collide. */
function variantKey(variant: Variant): string {
  return `${variant.phrases.join(",")}#${variant.tokens.join(" ")}`;
}

function dedupe(variants: Variant[]): Variant[] {
  const seen = new Set<string>();
  return variants.filter((variant) => {
    const key = variantKey(variant);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
