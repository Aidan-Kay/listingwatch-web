import * as webPush from "web-push";
import type { Logger } from "../logger.ts";
import type { KeyValueRepository, PushSubscriptionRepository } from "../repositories/simple-repositories.ts";

export interface PushPayload {
  title: string;
  body: string;
  keys: string[];
  /** Notifications with the same tag replace each other on the device. */
  tag: string;
}

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

/**
 * Sends Web Push messages to every subscribed device. The VAPID key pair is
 * generated on first start; the private half lives with the other secrets.
 * Subscriptions the push service says are gone (404/410) are deleted.
 */
export class PushSender {
  private readonly subscriptions: PushSubscriptionRepository;
  private readonly log: Logger;
  private readonly subject: string;
  private readonly keys: VapidKeys;

  constructor(options: { subscriptions: PushSubscriptionRepository; secrets: KeyValueRepository; appState: KeyValueRepository; subject: string; log: Logger }) {
    this.subscriptions = options.subscriptions;
    this.log = options.log;
    this.subject = options.subject;
    this.keys = loadOrCreateKeys(options.secrets, options.appState);
  }

  get publicKey(): string {
    return this.keys.publicKey;
  }

  async sendToAll(payload: PushPayload): Promise<void> {
    const body = JSON.stringify(payload);
    await Promise.all(this.subscriptions.list().map((subscription) => this.sendOne(subscription, body)));
  }

  private async sendOne(subscription: { endpoint: string; p256dh: string; auth: string }, body: string): Promise<void> {
    try {
      await webPush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, body, {
        TTL: 60 * 60,
        urgency: "high",
        vapidDetails: { subject: this.subject, publicKey: this.keys.publicKey, privateKey: this.keys.privateKey },
      });
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        this.subscriptions.delete(subscription.endpoint);
        this.log.info({ endpoint: endpointHost(subscription.endpoint) }, "Removed an expired push subscription");
        return;
      }
      this.log.warn({ err: error, endpoint: endpointHost(subscription.endpoint) }, "Push notification failed");
    }
  }
}

function loadOrCreateKeys(secrets: KeyValueRepository, appState: KeyValueRepository): VapidKeys {
  const publicKey = appState.get("vapid.publicKey");
  const privateKey = secrets.get("vapid.privateKey");
  if (publicKey && privateKey) return { publicKey, privateKey };
  const generated = webPush.generateVAPIDKeys();
  appState.set("vapid.publicKey", generated.publicKey);
  secrets.set("vapid.privateKey", generated.privateKey);
  return generated;
}

/** Log which push service, never the full endpoint (it's a capability URL). */
function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return "invalid";
  }
}
