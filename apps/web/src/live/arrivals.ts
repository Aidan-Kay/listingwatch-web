/**
 * Listings that arrived live (not on page load), so the feed can flare them
 * and offer a "new listings" pill when the user is scrolled away from the top.
 */
type Listener = (keys: string[]) => void;

const listeners = new Set<Listener>();
const arrived = new Set<string>();

export const liveArrivals = {
  announce(keys: string[]): void {
    for (const key of keys) arrived.add(key);
    for (const listener of listeners) listener(keys);
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** Whether a listing arrived while the app was open (it gets a one-off flare). */
  isLive(key: string): boolean {
    return arrived.has(key);
  },
};
