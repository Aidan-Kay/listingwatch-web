import type { LiveEvent } from "@listingwatch/shared/schemas";

export type LiveEventListener = (event: LiveEvent) => void;

/**
 * Domain events for connected browsers. Services publish what changed; the SSE
 * hub forwards it. A listener that throws can't break publishing.
 */
export class EventBus {
  private readonly listeners = new Set<LiveEventListener>();
  private readonly onListenerError: (error: unknown) => void;

  constructor(onListenerError: (error: unknown) => void) {
    this.onListenerError = onListenerError;
  }

  publish(event: LiveEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        this.onListenerError(error);
      }
    }
  }

  subscribe(listener: LiveEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
