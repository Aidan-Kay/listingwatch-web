/**
 * Split raw list text into terms: one per line, or comma-separated.
 *
 * A comma separates only at the top level. Inside a group it separates options
 * ("(7,VII)"), and inside a phrase it's punctuation. A newline always
 * separates, even inside an unclosed quote, which is far more likely a typo
 * than a phrase spanning lines.
 */
export function splitTerms(text: string): string[] {
  const terms: string[] = [];
  let current = "";
  let depth = 0;
  let inPhrase = false;
  for (const ch of text) {
    if (ch === "\n" || ch === "\r") {
      terms.push(current);
      current = "";
      inPhrase = false;
      depth = 0;
      continue;
    }
    if (ch === '"') inPhrase = !inPhrase;
    else if (!inPhrase && ch === "(") depth++;
    else if (!inPhrase && ch === ")") depth = Math.max(0, depth - 1);
    else if (!inPhrase && depth === 0 && ch === ",") {
      terms.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  terms.push(current);
  return terms.map((term) => term.trim()).filter((term) => term !== "");
}

/**
 * Clean a list of terms for storage: trim, drop blanks, and collapse
 * case-insensitive duplicates, keeping the first spelling.
 */
export function cleanTerms(terms: readonly string[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const raw of terms) {
    const term = raw.trim();
    const key = term.toLowerCase();
    if (term === "" || seen.has(key)) continue;
    seen.add(key);
    cleaned.push(term);
  }
  return cleaned;
}
