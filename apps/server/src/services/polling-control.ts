import type { EventBus } from "../events/event-bus.ts";
import type { Scheduler } from "../polling/scheduler.ts";
import type { KeyValueRepository } from "../repositories/simple-repositories.ts";

const PAUSED_KEY = "polling.paused";

/**
 * The global pause switch. It lives on the server (and survives restarts), so
 * every device shows the same state and nothing can disagree about it.
 */
export class PollingControl {
  private readonly scheduler: Scheduler;
  private readonly appState: KeyValueRepository;
  private readonly events: EventBus;

  constructor(scheduler: Scheduler, appState: KeyValueRepository, events: EventBus) {
    this.scheduler = scheduler;
    this.appState = appState;
    this.events = events;
  }

  get paused(): boolean {
    return this.appState.get(PAUSED_KEY) === "true";
  }

  /** Start polling at server start, unless the user left it paused. */
  startUp(): void {
    if (!this.paused) this.scheduler.startAll();
  }

  pause(): void {
    this.scheduler.stopAll();
    this.appState.set(PAUSED_KEY, "true");
    this.events.publish({ type: "polling.state", paused: true });
  }

  resume(): void {
    this.appState.set(PAUSED_KEY, "false");
    this.scheduler.startAll();
    this.events.publish({ type: "polling.state", paused: false });
  }

  /** (Re)start one search's loop if it should be running, otherwise make sure it isn't. */
  sync(searchId: string, enabled: boolean): void {
    if (enabled && !this.paused) this.scheduler.start(searchId);
    else this.scheduler.stop(searchId);
  }
}
