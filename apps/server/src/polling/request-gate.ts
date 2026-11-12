import { setTimeout as sleep } from "node:timers/promises";
import type { Source } from "@listingwatch/shared/marketplaces";

/**
 * Minimum spacing between polls to the same marketplace. Every search polls as
 * soon as polling starts, so without this a profile of a dozen searches would
 * arrive as one burst on startup and resume. Vinted gets more room: each call
 * is a real browser request with no published limit.
 */
export const DEFAULT_GAPS_MS: Record<Source, number> = { ebay: 1_000, vinted: 3_000 };

/**
 * Hands out request slots per marketplace in the order they're asked for. A
 * spacer, not a quota: nothing is dropped, only delayed. A caller whose poll is
 * cancelled while waiting gives up its wait (the slot stays spent, which only
 * errs on the side of spacing).
 */
export class RequestGate {
  private readonly gaps: Record<Source, number>;
  private readonly now: () => number;
  private readonly nextSlot = new Map<Source, number>();

  constructor(gaps: Record<Source, number> = DEFAULT_GAPS_MS, now: () => number = Date.now) {
    this.gaps = gaps;
    this.now = now;
  }

  /** Wait for this marketplace's next slot. Resolves with how long the caller waited. */
  async acquire(source: Source, signal: AbortSignal): Promise<number> {
    // Reserve synchronously so two callers in the same tick can't take the same slot.
    const now = this.now();
    const startAt = Math.max(now, this.nextSlot.get(source) ?? 0);
    this.nextSlot.set(source, startAt + this.gaps[source]);
    const wait = startAt - now;
    if (wait > 0) await sleep(wait, undefined, { signal });
    return wait;
  }

  /** Forget reservations made for polls that have all been cancelled. */
  reset(): void {
    this.nextSlot.clear();
  }
}
