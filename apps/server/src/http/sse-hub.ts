import type { ServerResponse } from "node:http";
import type { LiveEvent } from "@listingwatch/shared/schemas";
import type { EventBus } from "../events/event-bus.ts";

/** Comment line sent this often so proxies, which often drop streams idle for ~100 s, keep the connection. */
const HEARTBEAT_MS = 25_000;

/** Fans live events out to every connected browser as server-sent events. */
export class SseHub {
  private readonly clients = new Set<ServerResponse>();
  private readonly heartbeat: NodeJS.Timeout;

  constructor(events: EventBus) {
    events.subscribe((event) => this.broadcast(event));
    this.heartbeat = setInterval(() => this.writeAll(": keep-alive\n\n"), HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  get size(): number {
    return this.clients.size;
  }

  /** Take over a response as an event stream until the client goes away. */
  attach(response: ServerResponse, onClose: () => void): void {
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Stop nginx buffering the stream.
      "X-Accel-Buffering": "no",
    });
    response.write("retry: 3000\n\n");
    this.clients.add(response);
    response.on("close", () => {
      this.clients.delete(response);
      onClose();
    });
  }

  close(): void {
    clearInterval(this.heartbeat);
    for (const client of this.clients) client.end();
    this.clients.clear();
  }

  private broadcast(event: LiveEvent): void {
    this.writeAll(`data: ${JSON.stringify(event)}\n\n`);
  }

  private writeAll(chunk: string): void {
    for (const client of this.clients) client.write(chunk);
  }
}
