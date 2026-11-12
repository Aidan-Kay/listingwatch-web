import { settingsSchema, type Settings } from "@listingwatch/shared/schemas";
import { useEffect, useRef, useState } from "react";
import { useSaveSettings, useSettings } from "@/api/hooks";

export type SaveState = "idle" | "saving" | "saved" | "invalid";

/**
 * A local copy of the settings that saves itself: straight away for toggles
 * and pickers, after a pause for typed values. Invalid values aren't sent;
 * their problem is reported per field instead.
 */
export function useSettingsDraft(): {
  settings: Settings | null;
  change: (patch: Partial<Settings>, options?: { typing?: boolean }) => void;
  errors: Partial<Record<string, string>>;
  state: SaveState;
} {
  const query = useSettings();
  const save = useSaveSettings();
  const [draft, setDraft] = useState<Settings | null>(null);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [state, setState] = useState<SaveState>("idle");
  const timer = useRef<number | undefined>(undefined);
  const saveRef = useRef(save.mutate);
  saveRef.current = save.mutate;

  // Adopt server changes (from another device) unless the user is mid-edit here.
  const server = query.data?.settings;
  useEffect(() => {
    if (server && timer.current === undefined) setDraft(server);
  }, [server]);

  const persist = (next: Settings): void => {
    timer.current = undefined;
    const result = settingsSchema.safeParse(next);
    if (!result.success) {
      setErrors(Object.fromEntries(result.error.issues.map((issue) => [issue.path.join("."), issue.message])));
      setState("invalid");
      return;
    }
    setErrors({});
    setState("saving");
    saveRef.current(result.data, { onSuccess: () => setState("saved"), onError: () => setState("idle") });
  };

  const change = (patch: Partial<Settings>, options: { typing?: boolean } = {}): void => {
    if (!draft) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    window.clearTimeout(timer.current);
    if (options.typing) timer.current = window.setTimeout(() => persist(next), 700);
    else persist(next);
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { settings: draft, change, errors, state };
}
