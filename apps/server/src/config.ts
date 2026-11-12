import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const booleanFlag = z.enum(["true", "false", "1", "0"]).transform((value) => value === "true" || value === "1");

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8095),
  HOST: z.string().min(1).default("127.0.0.1"),
  DATA_DIR: z.string().min(1).default(path.join(SERVER_ROOT, "data")),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  VINTED_HEADLESS: booleanFlag.default(true),
  /** Contact the push services can reach (a mailto: or https: URL), required by Web Push. */
  VAPID_SUBJECT: z.string().regex(/^(mailto:|https:\/\/)/, "Use a mailto: or https:// URL").default("mailto:listingwatch@localhost"),
  WEB_DIST_DIR: z.string().default(path.resolve(SERVER_ROOT, "../web/dist")),
  /** The commit the image was built from; CI sets it, so a running server can say which build is answering. */
  LISTINGWATCH_REVISION: z.string().min(1).default("local"),
});

export interface Config {
  readonly port: number;
  readonly host: string;
  readonly logLevel: string;
  readonly vintedHeadless: boolean;
  readonly vapidSubject: string;
  readonly revision: string;
  readonly paths: {
    readonly data: string;
    readonly database: string;
    readonly logs: string;
    readonly browserProfile: string;
    readonly uploads: string;
    readonly webDist: string;
  };
}

/** Read and validate configuration from the environment. Throws with every problem listed. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Invalid configuration:\n${problems}`);
  }
  const e = parsed.data;
  const data = path.resolve(e.DATA_DIR);
  return {
    port: e.PORT,
    host: e.HOST,
    logLevel: e.LOG_LEVEL,
    vintedHeadless: e.VINTED_HEADLESS,
    vapidSubject: e.VAPID_SUBJECT,
    revision: e.LISTINGWATCH_REVISION,
    paths: {
      data,
      database: path.join(data, "listingwatch.db"),
      logs: path.join(data, "logs"),
      browserProfile: path.join(data, "browser"),
      uploads: path.join(data, "uploads"),
      webDist: path.resolve(e.WEB_DIST_DIR),
    },
  };
}
