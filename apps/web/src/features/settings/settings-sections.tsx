import { NOTIFIABLE_FORMATS } from "@listingwatch/shared/marketplaces";
import type { ConnectionTestResult, ImportResult, ProxyTestResult, Settings, SettingsView } from "@listingwatch/shared/schemas";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Play, Upload } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { queryKeys, useApiUsage, useSettings } from "@/api/hooks";
import { ColourSwatches } from "@/components/colour-swatches";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api, errorMessage, upload } from "@/lib/api";
import { plural } from "@/lib/format";
import { disablePush, enablePush, pushStatus, type PushStatus } from "@/lib/push";
import { playNotificationSound } from "@/lib/sound";
import { cn } from "@/lib/utils";

interface SectionProps {
  settings: Settings;
  change: (patch: Partial<Settings>, options?: { typing?: boolean }) => void;
  errors: Partial<Record<string, string>>;
}

function Section({ id, title, description, children }: { id?: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 rounded-xl border bg-card p-4 md:p-5">
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-4 flex flex-col gap-5">{children}</div>
    </section>
  );
}

/** A label and description on the left, its control on the right. */
function Row({ label, description, children, htmlFor }: { label: string; description?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </label>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** A number field that holds its text while typing and only reports valid numbers. */
function NumberSetting({ id, label, description, value, onChange, error, suffix }: { id: string; label: string; description?: string; value: number; onChange: (value: number) => void; error?: string | undefined; suffix?: string }) {
  const [text, setText] = useState(String(value));
  const [localError, setLocalError] = useState<string | null>(null);
  useEffect(() => setText(String(value)), [value]);
  const shown = localError ?? error;
  return (
    <Field data-invalid={shown ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          inputMode="numeric"
          value={text}
          className="w-32"
          onChange={(e) => {
            setText(e.target.value);
            const number = Number(e.target.value);
            if (e.target.value.trim() === "" || !Number.isFinite(number)) return setLocalError("Enter a number");
            setLocalError(null);
            onChange(number);
          }}
        />
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>
      {shown ? <FieldError>{shown}</FieldError> : description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  );
}

export function NotificationSettings({ settings, change }: SectionProps) {
  const toggleFormat = (format: (typeof NOTIFIABLE_FORMATS)[number], on: boolean): void =>
    change({ notifyFormats: on ? [...settings.notifyFormats, format] : settings.notifyFormats.filter((f) => f !== format) });
  return (
    <Section title="Notifications">
      <PushToggle />
      <Field>
        <FieldLabel>Notify about</FieldLabel>
        <div className="flex flex-wrap gap-4">
          {NOTIFIABLE_FORMATS.map((format) => (
            <label key={format} className="flex items-center gap-2 text-sm">
              <Checkbox checked={settings.notifyFormats.includes(format)} onCheckedChange={(on) => toggleFormat(format, on === true)} />
              {format === "Auction" ? "Auctions" : "Buy It Now listings"}
            </label>
          ))}
        </div>
      </Field>
      <Row label="Notify while the app is open" description="When off, no notification is sent while ListingWatch is on screen on any of your devices.">
        <Switch checked={settings.notifyWhenFocused} onCheckedChange={(notifyWhenFocused) => change({ notifyWhenFocused })} aria-label="Notify while the app is open" />
      </Row>
      <Row label="Sound in the app" description="Played by an open ListingWatch when notifiable listings arrive.">
        <Switch checked={settings.sound.enabled} onCheckedChange={(enabled) => change({ sound: { ...settings.sound, enabled } })} aria-label="Sound in the app" />
      </Row>
      {settings.sound.enabled && <SoundControls settings={settings} change={change} />}
    </Section>
  );
}

function SoundControls({ settings, change }: Pick<SectionProps, "settings" | "change">) {
  const client = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const replaceView = (view: SettingsView): void => {
    client.setQueryData(queryKeys.settings, view);
  };
  const choose = async (file: File): Promise<void> => {
    setBusy(true);
    try {
      replaceView(await upload<SettingsView>("/settings/sound", file));
      toast.success("Sound uploaded");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const removeSound = async (): Promise<void> => replaceView(await api<SettingsView>("/settings/sound", { method: "DELETE" }));
  return (
    <div className="flex flex-col gap-4 rounded-lg bg-muted/40 p-3">
      <div className="flex items-center gap-3">
        <span className="w-16 text-sm">Volume</span>
        <Slider value={[settings.sound.volume * 100]} max={100} step={5} onValueChange={([v = 100]) => change({ sound: { ...settings.sound, volume: v / 100 } }, { typing: true })} aria-label="Volume" className="flex-1" />
        <Button variant="outline" size="icon-sm" onClick={() => playNotificationSound(settings.sound)} aria-label="Play the sound">
          <Play />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">{settings.sound.customName ? `Custom: ${settings.sound.customName}` : "Built-in chime"}</span>
        <Button variant="outline" size="sm" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? <Spinner /> : <Upload />} {settings.sound.customName ? "Replace" : "Use my own sound"}
        </Button>
        {settings.sound.customName && (
          <Button variant="ghost" size="sm" onClick={() => void removeSound()}>
            Use built-in
          </Button>
        )}
        <input
          ref={input}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void choose(file);
          }}
        />
      </div>
    </div>
  );
}

const PUSH_MESSAGES: Record<PushStatus, string> = {
  unsupported: "This browser can't receive push notifications here.",
  "needs-install": "On iPhone and iPad, add ListingWatch to your home screen (Share › Add to Home Screen), then turn notifications on from there.",
  blocked: "Notifications are blocked for this site. Allow them in the browser's site settings, then come back.",
  off: "This device isn't receiving notifications.",
  on: "This device gets a notification when new listings arrive.",
};

/** Push for this device: each phone or computer subscribes separately. */
function PushToggle() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void pushStatus().then(setStatus);
  }, []);
  const toggle = async (): Promise<void> => {
    setBusy(true);
    try {
      setStatus(status === "on" ? await disablePush() : await enablePush());
    } catch (error) {
      toast.error(`Couldn't change notifications: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  };
  if (status === null) return null;
  const canToggle = status === "on" || status === "off";
  return (
    <Row label="Notifications on this device" description={PUSH_MESSAGES[status]}>
      {canToggle && (
        <Button variant={status === "on" ? "outline" : "default"} size="sm" onClick={() => void toggle()} disabled={busy}>
          {busy && <Spinner />}
          {status === "on" ? "Turn off" : "Turn on"}
        </Button>
      )}
    </Row>
  );
}

export function PollingSettings({ settings, change, errors }: SectionProps) {
  return (
    <Section title="Polling" description="Each search polls at a random moment in this range, unless it has its own.">
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberSetting id="minInterval" label="At least every" suffix="seconds" value={settings.minInterval} onChange={(minInterval) => change({ minInterval }, { typing: true })} error={errors.minInterval} />
        <NumberSetting id="maxInterval" label="At most every" suffix="seconds" value={settings.maxInterval} onChange={(maxInterval) => change({ maxInterval }, { typing: true })} error={errors.maxInterval} />
      </div>
      <NumberSetting
        id="backfill"
        label="On a search's first poll, show listings from the last"
        suffix="hours"
        description="So a new search shows recent listings straight away (0 shows only what's listed from then on). Vinted doesn't say when items were listed, so it only shows new ones."
        value={settings.backfillHours}
        onChange={(backfillHours) => change({ backfillHours }, { typing: true })}
        error={errors.backfillHours}
      />
    </Section>
  );
}

export function EbaySettings({ settings, change, errors }: SectionProps) {
  const view = useSettings();
  const credentials = view.data?.ebayCredentials;
  return (
    <Section id="ebay" title="eBay API" description="eBay searches use eBay's official API, which needs a free developer account.">
      <div className="flex items-center gap-2 text-sm">
        Credentials:
        {credentials?.configured ? <Badge variant="secondary">Set · {credentials.clientIdHint}</Badge> : <Badge variant="destructive">Not set</Badge>}
      </div>
      <CredentialsForm configured={credentials?.configured ?? false} />
      <UsageMeter />
      <NumberSetting id="ebayLimit" label="Daily call limit" value={settings.ebayDailyLimit} onChange={(ebayDailyLimit) => change({ ebayDailyLimit }, { typing: true })} error={errors.ebayDailyLimit} description="eBay's standard limit is 5,000 calls a day." />
    </Section>
  );
}

function CredentialsForm({ configured }: { configured: boolean }) {
  const client = useQueryClient();
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState<"save" | "test" | "remove" | null>(null);
  const [result, setResult] = useState<ConnectionTestResult | null>(null);
  const run = async (action: "save" | "test" | "remove"): Promise<void> => {
    setBusy(action);
    setResult(null);
    try {
      if (action === "save") {
        client.setQueryData(queryKeys.settings, await api<SettingsView>("/settings/ebay-credentials", { method: "PUT", body: { clientId, clientSecret } }));
        setClientId("");
        setClientSecret("");
        setResult(await api<ConnectionTestResult>("/ebay/test-connection", { method: "POST" }));
      } else if (action === "test") {
        setResult(await api<ConnectionTestResult>("/ebay/test-connection", { method: "POST" }));
      } else {
        client.setQueryData(queryKeys.settings, await api<SettingsView>("/settings/ebay-credentials", { method: "DELETE" }));
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="clientId">Client ID (App ID)</FieldLabel>
          <Input id="clientId" value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" placeholder={configured ? "Enter to replace" : "YourName-App-PRD-…"} />
        </Field>
        <Field>
          <FieldLabel htmlFor="clientSecret">Client Secret (Cert ID)</FieldLabel>
          <Input id="clientSecret" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} autoComplete="off" placeholder={configured ? "Enter to replace" : "PRD-…"} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void run("save")} disabled={busy !== null || clientId.trim() === "" || clientSecret.trim() === ""}>
          {busy === "save" && <Spinner />} Save and test
        </Button>
        {configured && (
          <>
            <Button size="sm" variant="outline" onClick={() => void run("test")} disabled={busy !== null}>
              {busy === "test" && <Spinner />} Test connection
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void run("remove")} disabled={busy !== null}>
              Remove
            </Button>
          </>
        )}
      </div>
      {result && (
        <Alert variant={result.ok ? "default" : "destructive"}>
          <AlertDescription>{result.ok ? "Connected: eBay accepted the credentials." : result.error}</AlertDescription>
        </Alert>
      )}
      <p className="text-sm text-muted-foreground">
        Kept on the server and never shown again after saving. Create them at{" "}
        <a href="https://developer.ebay.com/my/keys" target="_blank" rel="noopener noreferrer" className="underline">
          developer.ebay.com
        </a>{" "}
        (Production keys).
      </p>
    </div>
  );
}

function UsageMeter() {
  const usage = useApiUsage();
  if (!usage.data) return null;
  const { calls, limit, projectedDaily } = usage.data;
  const ratio = Math.min(1, calls / limit);
  const colour = ratio >= 0.9 ? "bg-destructive" : ratio >= 0.7 ? "bg-amber-500" : "bg-primary";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-sm">
        <span>API calls today (UTC)</span>
        <span className="tabular-nums">
          {calls.toLocaleString()} / {limit.toLocaleString()}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={calls} aria-valuemax={limit} aria-label="eBay API calls today">
        <div className={cn("h-full rounded-full transition-all", colour)} style={{ width: `${ratio * 100}%` }} />
      </div>
      <p className={cn("text-sm", projectedDaily > limit ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
        Your enabled eBay searches use about {plural(projectedDaily, "call")} a day{projectedDaily > limit && ", more than the limit. Lengthen their intervals"}.
      </p>
    </div>
  );
}

export function ProxySettings({ settings, change, errors }: SectionProps) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ProxyTestResult | null>(null);
  const test = async (): Promise<void> => {
    setTesting(true);
    setResult(null);
    try {
      setResult(await api<ProxyTestResult>("/settings/test-proxy", { method: "POST", body: { url: settings.proxy.url } }));
    } catch (error) {
      setResult({ ok: false, error: errorMessage(error) });
    } finally {
      setTesting(false);
    }
  };
  const urlError = errors["proxy.url"] ?? errors.proxy;
  return (
    <Section id="proxy" title="Proxy" description="Send eBay and Vinted traffic through a proxy or VPN endpoint.">
      <Row label="Use a proxy">
        <Switch checked={settings.proxy.enabled} onCheckedChange={(enabled) => change({ proxy: { ...settings.proxy, enabled } })} aria-label="Use a proxy" />
      </Row>
      <Field data-invalid={urlError ? true : undefined}>
        <FieldLabel htmlFor="proxyUrl">Proxy address</FieldLabel>
        <div className="flex gap-2">
          <Input id="proxyUrl" value={settings.proxy.url} onChange={(e) => change({ proxy: { ...settings.proxy, url: e.target.value } }, { typing: true })} placeholder="http://user:pass@host:port or socks5://host:port" autoComplete="off" />
          <Button variant="outline" onClick={() => void test()} disabled={testing || settings.proxy.url.trim() === ""}>
            {testing && <Spinner />} Test
          </Button>
        </div>
        {urlError && <FieldError>{urlError}</FieldError>}
      </Field>
      {result && (
        <Alert variant={result.ok ? "default" : "destructive"}>
          <AlertDescription>{result.ok ? `Working. Traffic leaves from ${result.ip}.` : `Didn't work: ${result.error}`}</AlertDescription>
        </Alert>
      )}
    </Section>
  );
}

export function AppearanceSettings({ settings, change }: SectionProps) {
  const { theme, setTheme } = useTheme();
  return (
    <Section title="Appearance">
      <Field>
        <FieldLabel>Accent colour</FieldLabel>
        <ColourSwatches value={settings.accentColor} onChange={(accentColor) => accentColor && change({ accentColor })} />
      </Field>
      <Row label="Theme" description="Per device.">
        <ToggleGroup type="single" variant="outline" size="sm" value={theme ?? "dark"} onValueChange={(value) => value && setTheme(value)} aria-label="Theme">
          <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
          <ToggleGroupItem value="light">Light</ToggleGroupItem>
          <ToggleGroupItem value="system">System</ToggleGroupItem>
        </ToggleGroup>
      </Row>
    </Section>
  );
}

export function BackupSettings() {
  const client = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const restore = async (file: File): Promise<void> => {
    setBusy(true);
    try {
      const result = await api<ImportResult>("/backup", { method: "POST", body: JSON.parse(await file.text()) as unknown });
      await client.invalidateQueries();
      toast.success(`Imported ${plural(result.searches, "search", "searches")} and ${plural(result.matchLists, "match list")}.`);
    } catch (error) {
      toast.error(error instanceof SyntaxError ? "That file isn't valid JSON" : errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="Backup" description="Searches, match lists and settings. eBay credentials are never included.">
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <a href="/api/backup" download>
            <Download /> Download backup
          </a>
        </Button>
        <Button variant="outline" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? <Spinner /> : <Upload />} Restore from a file
        </Button>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void restore(file);
          }}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        Restoring replaces your searches and match lists, and clears the feed. Backups from the ListingWatch desktop app work too (desktop app: Settings › Backup & Restore › Export).
      </p>
    </Section>
  );
}
