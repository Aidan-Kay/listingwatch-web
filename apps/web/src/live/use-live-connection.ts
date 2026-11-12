import type { LiveEvent, SettingsView } from "@listingwatch/shared/schemas";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { queryKeys } from "@/api/hooks";
import { playNotificationSound } from "@/lib/sound";
import { applyLiveEvent } from "./apply-event";
import { liveArrivals } from "./arrivals";

export type ConnectionState = "connecting" | "live" | "reconnecting";

/** Identifies this tab to the server, for "is the app visible somewhere" decisions. */
const CLIENT_ID = crypto.randomUUID();
const PRESENCE_INTERVAL_MS = 60_000;

/**
 * Keep the app in sync with the server: subscribe to live events, apply them to
 * cached data, play the sound for notifiable arrivals while visible, and report
 * this tab's visibility. After a dropped connection everything is refetched,
 * since events may have been missed.
 */
export function useLiveConnection(): ConnectionState {
  const client = useQueryClient();
  const [state, setState] = useState<ConnectionState>("connecting");

  useEffect(() => {
    const source = new EventSource(`/api/events?clientId=${CLIENT_ID}`);
    let everConnected = false;
    source.onopen = () => {
      if (everConnected) void client.invalidateQueries();
      everConnected = true;
      setState("live");
    };
    source.onerror = () => setState("reconnecting");
    source.onmessage = (message: MessageEvent<string>) => {
      const event = JSON.parse(message.data) as LiveEvent;
      applyLiveEvent(client, event);
      if (event.type === "listings.added") onArrival(event.listings.map((l) => l.key), event.notifiable);
    };
    const onArrival = (keys: string[], notifiable: string[]): void => {
      liveArrivals.announce(keys);
      const sound = client.getQueryData<SettingsView>(queryKeys.settings)?.settings.sound;
      if (notifiable.length > 0 && sound && document.visibilityState === "visible") playNotificationSound(sound);
    };
    return () => source.close();
  }, [client]);

  useEffect(() => reportPresence(), []);
  return state;
}

function reportPresence(): () => void {
  const send = (): void => {
    void fetch("/api/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: CLIENT_ID, visible: document.visibilityState === "visible" }),
      keepalive: true,
    }).catch(() => {});
  };
  send();
  document.addEventListener("visibilitychange", send);
  const timer = window.setInterval(send, PRESENCE_INTERVAL_MS);
  return () => {
    document.removeEventListener("visibilitychange", send);
    window.clearInterval(timer);
  };
}
