import { Check, CircleAlert } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "react-router";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { AppearanceSettings, BackupSettings, EbaySettings, NotificationSettings, PollingSettings, ProxySettings } from "./settings-sections";
import { useSettingsDraft, type SaveState } from "./use-settings-draft";

export function SettingsPage() {
  const { settings, change, errors, state } = useSettingsDraft();
  useScrollToHash();
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title="Settings" description="Changes save automatically." actions={<SaveIndicator state={state} />} />
      <div className="flex max-w-3xl flex-col gap-8 px-4 pb-10 md:px-6">
        {settings ? (
          <>
            <NotificationSettings settings={settings} change={change} errors={errors} />
            <PollingSettings settings={settings} change={change} errors={errors} />
            <EbaySettings settings={settings} change={change} errors={errors} />
            <ProxySettings settings={settings} change={change} errors={errors} />
            <AppearanceSettings settings={settings} change={change} errors={errors} />
            <BackupSettings />
          </>
        ) : (
          <Skeleton className="h-96 rounded-xl" />
        )}
      </div>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const content = {
    saving: [<Spinner key="i" />, "Saving…"],
    saved: [<Check key="i" className="size-4 text-emerald-500" />, "Saved"],
    invalid: [<CircleAlert key="i" className="size-4 text-destructive" />, "Not saved: fix the highlighted value"],
  }[state];
  return (
    <span className="flex items-center gap-1.5 text-sm text-muted-foreground" role="status" aria-live="polite">
      {content}
    </span>
  );
}

/** Links like /settings#ebay (from error advice) land on the right section. */
function useScrollToHash(): void {
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
  }, [hash]);
}
