import type { Listing } from "@listingwatch/shared/schemas";
import { buildNotification, selectNotifiable } from "../domain/notify.ts";
import type { Logger } from "../logger.ts";
import type { NewListingsNotifier } from "../polling/poller.ts";
import type { Repositories } from "../repositories/index.ts";
import type { PresenceTracker } from "./presence.ts";
import type { PushSender } from "./push-sender.ts";

/**
 * Decides whether new listings are worth a notification, and sends a push
 * unless the user is already looking at the app (and asked not to be
 * interrupted then). The visible browser plays the sound itself.
 */
export class Notifier implements NewListingsNotifier {
  private readonly repos: Repositories;
  private readonly push: PushSender;
  private readonly presence: PresenceTracker;
  private readonly log: Logger;

  constructor(options: { repos: Repositories; push: PushSender; presence: PresenceTracker; log: Logger }) {
    this.repos = options.repos;
    this.push = options.push;
    this.presence = options.presence;
    this.log = options.log;
  }

  notify(listings: readonly Listing[]): string[] {
    const settings = this.repos.settings.get();
    const searches = new Map(this.repos.searches.list().map((search) => [search.id, search]));
    const notifiable = selectNotifiable(listings, searches, settings);
    const content = buildNotification(notifiable, searches);
    if (content === null) return [];
    if (!settings.notifyWhenFocused && this.presence.anyVisible()) {
      this.log.debug({ count: notifiable.length }, "App is visible; skipping push");
      return content.keys;
    }
    this.push.sendToAll({ ...content, tag: "new-listings" }).catch((error: unknown) => this.log.error({ err: error }, "Sending pushes failed"));
    return content.keys;
  }
}
