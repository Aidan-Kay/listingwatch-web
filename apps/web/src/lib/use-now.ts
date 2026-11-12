import { useSyncExternalStore } from "react";

/**
 * One shared clock for every "5m ago" on screen, ticking every 15 seconds,
 * rather than a timer per card.
 */
const TICK_MS = 15_000;
let now = Date.now();
const listeners = new Set<() => void>();
let timer: number | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null) {
    timer = window.setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

export function useNow(): number {
  return useSyncExternalStore(subscribe, () => now);
}
