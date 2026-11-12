import fs from "node:fs";
import path from "node:path";
import type { ConnectionTestResult, EbayCredentialsInput, ProxyTestResult, Settings, SettingsView } from "@listingwatch/shared/schemas";
import type { EventBus } from "../events/event-bus.ts";
import type { Logger } from "../logger.ts";
import type { EbayClient, EbayCredentials } from "../marketplaces/ebay/client.ts";
import type { VintedAdapter } from "../marketplaces/vinted/adapter.ts";
import { fetchThroughProxy, type HttpClient } from "../net/http-client.ts";
import type { Repositories } from "../repositories/index.ts";
import type { KeyValueRepository } from "../repositories/simple-repositories.ts";
import { badRequest, notFound } from "./errors.ts";

const CLIENT_ID = "ebay.clientId";
const CLIENT_SECRET = "ebay.clientSecret";
const SOUND_TYPE_KEY = "sound.contentType";
export const MAX_SOUND_BYTES = 2 * 1024 * 1024;

export interface SettingsServiceDeps {
  repos: Repositories;
  events: EventBus;
  http: HttpClient;
  ebay: EbayClient;
  vinted: VintedAdapter;
  uploadsDir: string;
  log: Logger;
}

/** Settings, eBay credentials (never sent to the browser), the proxy and the custom sound. */
export class SettingsService {
  private readonly deps: SettingsServiceDeps;

  constructor(deps: SettingsServiceDeps) {
    this.deps = deps;
  }

  view(): SettingsView {
    const credentials = this.ebayCredentials();
    return {
      settings: this.deps.repos.settings.get(),
      ebayCredentials: { configured: credentials !== null, clientIdHint: credentials ? `${credentials.clientId.slice(0, 12)}…` : null },
    };
  }

  /** Save settings. The custom sound's name is the server's to set, so it's kept as stored. */
  async update(next: Settings): Promise<SettingsView> {
    const previous = this.deps.repos.settings.get();
    const settings: Settings = { ...next, sound: { ...next.sound, customName: previous.sound.customName } };
    this.deps.repos.settings.save(settings);
    if (proxyUrlOf(previous) !== proxyUrlOf(settings)) await this.applyProxy(settings);
    this.deps.events.publish({ type: "settings.changed" });
    return this.view();
  }

  /** Route eBay calls and the Vinted browser through the configured proxy (called at start-up too). */
  async applyProxy(settings: Settings = this.deps.repos.settings.get()): Promise<void> {
    const url = proxyUrlOf(settings);
    this.deps.http.useProxy(url);
    await this.deps.vinted.useProxy(url);
    this.deps.log.info({ proxy: url !== null }, "Proxy settings applied");
  }

  ebayCredentials(): EbayCredentials | null {
    return readEbayCredentials(this.deps.repos.secrets);
  }

  setEbayCredentials(input: EbayCredentialsInput): SettingsView {
    this.deps.repos.secrets.set(CLIENT_ID, input.clientId);
    this.deps.repos.secrets.set(CLIENT_SECRET, input.clientSecret);
    this.deps.ebay.invalidateToken();
    this.deps.events.publish({ type: "settings.changed" });
    return this.view();
  }

  clearEbayCredentials(): SettingsView {
    this.deps.repos.secrets.delete(CLIENT_ID);
    this.deps.repos.secrets.delete(CLIENT_SECRET);
    this.deps.ebay.invalidateToken();
    this.deps.events.publish({ type: "settings.changed" });
    return this.view();
  }

  async testEbayConnection(signal: AbortSignal): Promise<ConnectionTestResult> {
    try {
      await this.deps.ebay.verifyCredentials(signal);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /** Fetch an IP echo service through the proxy, to show it works and where traffic exits. */
  async testProxy(url: string): Promise<ProxyTestResult> {
    try {
      const response = await fetchThroughProxy(url, "https://api.ipify.org?format=json", 10_000);
      if (!response.ok) return { ok: false, error: `The test service answered ${response.status}` };
      const { ip } = (await response.json()) as { ip?: string };
      return ip ? { ok: true, ip } : { ok: false, error: "The test service gave no IP address" };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? (error.cause instanceof Error ? error.cause.message : error.message) : String(error) };
    }
  }

  // ─── Custom notification sound ─────────────────────────────────────────────

  async saveSound(data: Buffer, contentType: string, fileName: string): Promise<SettingsView> {
    if (!contentType.startsWith("audio/")) throw badRequest("Choose an audio file");
    if (data.length > MAX_SOUND_BYTES) throw badRequest("Sound files can be up to 2 MB");
    await fs.promises.mkdir(this.deps.uploadsDir, { recursive: true });
    await fs.promises.writeFile(this.soundPath(), data);
    this.deps.repos.appState.set(SOUND_TYPE_KEY, contentType);
    this.setSoundName(path.basename(fileName).slice(0, 200));
    return this.view();
  }

  async deleteSound(): Promise<SettingsView> {
    await fs.promises.rm(this.soundPath(), { force: true });
    this.setSoundName(null);
    return this.view();
  }

  /** The uploaded sound, for the browser to play. */
  sound(): { path: string; contentType: string } {
    const contentType = this.deps.repos.appState.get(SOUND_TYPE_KEY);
    if (!contentType || !fs.existsSync(this.soundPath())) throw notFound("Custom sound");
    return { path: this.soundPath(), contentType };
  }

  private setSoundName(customName: string | null): void {
    const settings = this.deps.repos.settings.get();
    this.deps.repos.settings.save({ ...settings, sound: { ...settings.sound, customName } });
    this.deps.events.publish({ type: "settings.changed" });
  }

  private soundPath(): string {
    return path.join(this.deps.uploadsDir, "notification-sound");
  }
}

/** The stored eBay credentials, or null until both are set. */
export function readEbayCredentials(secrets: KeyValueRepository): EbayCredentials | null {
  const clientId = secrets.get(CLIENT_ID);
  const clientSecret = secrets.get(CLIENT_SECRET);
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

function proxyUrlOf(settings: Settings): string | null {
  return settings.proxy.enabled && settings.proxy.url !== "" ? settings.proxy.url : null;
}
