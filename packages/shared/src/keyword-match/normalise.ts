/**
 * Normalise text for comparison: strip diacritics, lowercase, and collapse
 * every run of non-alphanumeric characters to one space.
 *
 * NFKD decomposition followed by dropping combining marks makes "Pokémon" and
 * "Pokemon" identical. Characters with no ASCII decomposition (Polish "ł")
 * become spaces: lossy, but applied identically to terms and titles.
 */
export function normalise(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Normalised words of `text`, or an empty array. */
export function tokensOf(text: string): string[] {
  const normalised = normalise(text);
  return normalised === "" ? [] : normalised.split(" ");
}
