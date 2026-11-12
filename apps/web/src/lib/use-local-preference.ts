import { useCallback, useState } from "react";

/**
 * A per-device preference kept in localStorage (card size, feed filters…).
 * Falls back to the default when storage is unavailable or holds junk.
 */
export function useLocalPreference<T>(key: string, fallback: T, isValid: (value: unknown) => value is T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`lw.${key}`);
      const parsed: unknown = raw === null ? fallback : JSON.parse(raw);
      return isValid(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  });
  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(`lw.${key}`, JSON.stringify(next));
      } catch {
        // Storage full or blocked: the preference just won't persist.
      }
    },
    [key],
  );
  return [value, update];
}

export const isOneOf =
  <T extends string>(options: readonly T[]) =>
  (value: unknown): value is T =>
    typeof value === "string" && (options as readonly string[]).includes(value);
