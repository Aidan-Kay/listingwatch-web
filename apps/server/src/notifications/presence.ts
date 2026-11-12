/** A report counts until this long after it was made; browsers re-report every minute. */
const PRESENCE_TTL_MS = 90_000;

/**
 * Which browsers currently have the app visible. With "notify when focused"
 * off, a visible app means the user is already looking, so no push is sent.
 */
export class PresenceTracker {
  private readonly clients = new Map<string, { visible: boolean; at: number }>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  report(clientId: string, visible: boolean): void {
    this.clients.set(clientId, { visible, at: this.now() });
  }

  forget(clientId: string): void {
    this.clients.delete(clientId);
  }

  anyVisible(): boolean {
    const cutoff = this.now() - PRESENCE_TTL_MS;
    for (const [clientId, state] of this.clients) {
      if (state.at < cutoff) this.clients.delete(clientId);
      else if (state.visible) return true;
    }
    return false;
  }
}
