import { z } from "zod";
import { NOTIFIABLE_FORMATS } from "../marketplaces/index.ts";
import { hexColor, pollInterval } from "./search.ts";

/** Indigo: dark enough that white text on it stays readable. */
export const DEFAULT_ACCENT_COLOUR = "#5865f2";

export const proxyUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((value) => value === "" || /^(https?|socks5h?):\/\/[^\s]+$/i.test(value), "Use http://, https:// or socks5:// followed by host:port");

export const settingsSchema = z
  .object({
    minInterval: pollInterval.default(30),
    maxInterval: pollInterval.default(120),
    /** On a search's first poll, show listings from the last N hours (0 = only what's listed from now on). */
    backfillHours: z.number().int().min(0).max(168).default(24),
    notifyFormats: z.array(z.enum(NOTIFIABLE_FORMATS)).default([...NOTIFIABLE_FORMATS]),
    /** When false, no push is sent while the app is visible on any device. */
    notifyWhenFocused: z.boolean().default(false),
    sound: z
      .object({
        enabled: z.boolean().default(true),
        volume: z.number().min(0).max(1).default(1),
        /** Set by the server when a custom sound is uploaded. */
        customName: z.string().max(200).nullable().default(null),
      })
      .prefault({}),
    accentColor: hexColor.default(DEFAULT_ACCENT_COLOUR),
    proxy: z
      .object({
        enabled: z.boolean().default(false),
        url: proxyUrlSchema.default(""),
      })
      .prefault({})
      .refine((proxy) => !proxy.enabled || proxy.url !== "", { message: "Enter a proxy URL", path: ["url"] }),
    ebayDailyLimit: z.number().int().min(1).max(1_000_000).default(5000),
  })
  .refine((s) => s.minInterval <= s.maxInterval, { message: "Maximum interval is below the minimum", path: ["maxInterval"] });
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});

export const ebayCredentialsInputSchema = z.object({
  clientId: z.string().trim().min(1, "Enter the Client ID").max(200),
  clientSecret: z.string().trim().min(1, "Enter the Client Secret").max(200),
});
export type EbayCredentialsInput = z.infer<typeof ebayCredentialsInputSchema>;

/** What the browser sees: settings plus whether credentials exist, never the credentials. */
export const settingsViewSchema = z.object({
  settings: settingsSchema,
  ebayCredentials: z.object({
    configured: z.boolean(),
    /** The first few characters of the Client ID, to recognise which app is set. */
    clientIdHint: z.string().nullable(),
  }),
});
export type SettingsView = z.infer<typeof settingsViewSchema>;
