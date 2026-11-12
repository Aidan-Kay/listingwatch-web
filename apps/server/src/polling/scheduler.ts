import { setTimeout as sleep } from "node:timers/promises";
import type { Logger } from "../logger.ts";
import { isAbortError } from "../marketplaces/errors.ts";
import type { PollResult } from "./poller.ts";

const UNEXPECTED_ERROR_DELAY_MS = 60_000;

export interface SchedulerDeps {
  /** Poll a search once. Resolves with null when the search no longer exists or is disabled. */
  poll: (searchId: string, signal: AbortSignal) => Promise<PollResult | null>;
  /** Milliseconds to wait after a poll. */
  delayAfter: (result: PollResult) => number;
  /** Enabled search IDs, for starting everything. */
  enabledSearchIds: () => string[];
  /** Called when every loop has just been cancelled (lets the request gate reset). */
  onAllStopped: () => void;
  log: Logger;
}

/**
 * One poll loop per search. Starting a loop cancels any previous loop for the
 * same search through its AbortController, so there can never be two, and a
 * poll still in flight from a cancelled loop sees its signal aborted and
 * leaves no trace.
 */
export class Scheduler {
  private readonly deps: SchedulerDeps;
  private readonly loops = new Map<string, AbortController>();

  constructor(deps: SchedulerDeps) {
    this.deps = deps;
  }

  get running(): number {
    return this.loops.size;
  }

  /** Start (or restart) the loop for a search. The first poll happens straight away. */
  start(searchId: string): void {
    this.stop(searchId);
    const controller = new AbortController();
    this.loops.set(searchId, controller);
    void this.run(searchId, controller);
  }

  stop(searchId: string): void {
    this.loops.get(searchId)?.abort();
    this.loops.delete(searchId);
  }

  startAll(): void {
    for (const id of this.deps.enabledSearchIds()) this.start(id);
  }

  stopAll(): void {
    for (const controller of this.loops.values()) controller.abort();
    this.loops.clear();
    this.deps.onAllStopped();
  }

  private async run(searchId: string, controller: AbortController): Promise<void> {
    const { signal } = controller;
    try {
      while (!signal.aborted) {
        let delay: number;
        try {
          const result = await this.deps.poll(searchId, signal);
          if (result === null) break;
          delay = this.deps.delayAfter(result);
        } catch (error) {
          if (isAbortError(error)) break;
          // A bug in one poll mustn't silently end the search's polling.
          this.deps.log.error({ err: error, searchId }, "Poll failed unexpectedly; trying again in a minute");
          delay = UNEXPECTED_ERROR_DELAY_MS;
        }
        await sleep(delay, undefined, { signal });
      }
    } catch (error) {
      if (!isAbortError(error)) this.deps.log.error({ err: error, searchId }, "Poll loop crashed");
    } finally {
      // Only remove the entry if it's still this loop's (a restart replaces it).
      if (this.loops.get(searchId) === controller) this.loops.delete(searchId);
    }
  }
}
