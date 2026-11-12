import { MIN_POLL_INTERVAL_SECONDS, type SearchInput, type Settings } from "@listingwatch/shared/schemas";

/** Consecutive failures double the delay up to this multiple. */
export const MAX_BACKOFF_MULTIPLIER = 16;

/** The search's own interval range if it has one, else the global one, never below the floor. */
export function intervalRange(search: Pick<SearchInput, "minInterval" | "maxInterval">, settings: Settings): { min: number; max: number } {
  const min = Math.max(search.minInterval ?? settings.minInterval, MIN_POLL_INTERVAL_SECONDS);
  const max = Math.max(search.maxInterval ?? settings.maxInterval, min);
  return { min, max };
}

/**
 * Milliseconds until the next poll: random within the range (so requests
 * don't fall into a detectable rhythm), doubled per consecutive failure.
 */
export function nextPollDelayMs(
  search: Pick<SearchInput, "minInterval" | "maxInterval">,
  consecutiveErrors: number,
  settings: Settings,
  random: () => number = Math.random,
): number {
  const { min, max } = intervalRange(search, settings);
  const base = (min + random() * (max - min)) * 1000;
  return Math.round(base * Math.min(2 ** consecutiveErrors, MAX_BACKOFF_MULTIPLIER));
}

/** Requests a day the searches make at the midpoint of their ranges (for the eBay quota estimate). */
export function projectedDailyCalls(searches: readonly Pick<SearchInput, "minInterval" | "maxInterval">[], settings: Settings): number {
  return Math.round(
    searches.reduce((total, search) => {
      const { min, max } = intervalRange(search, settings);
      return total + 86_400 / ((min + max) / 2);
    }, 0),
  );
}
