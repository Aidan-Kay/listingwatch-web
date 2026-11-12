import fs from "node:fs";
import path from "node:path";
import { pino, type Logger } from "pino";

export type { Logger };

/**
 * Structured logger writing to stdout and to daily-rotated files in the data
 * directory (10 MB per file, 14 files kept). Timestamps are ISO 8601 UTC.
 */
export function createLogger(options: { level: string; logDir: string; pretty: boolean }): Logger {
  fs.mkdirSync(options.logDir, { recursive: true });
  const transport = pino.transport({
    targets: [
      options.pretty
        ? { target: "pino-pretty", level: options.level, options: { translateTime: "UTC:yyyy-mm-dd'T'HH:MM:ss.l'Z'", ignore: "pid,hostname" } }
        : { target: "pino/file", level: options.level, options: { destination: 1 } },
      {
        target: "pino-roll",
        level: options.level,
        options: {
          file: path.join(options.logDir, "server"),
          extension: ".log",
          frequency: "daily",
          size: "10m",
          mkdir: true,
          limit: { count: 14 },
        },
      },
    ],
  });
  return pino({ level: options.level, timestamp: pino.stdTimeFunctions.isoTime, base: undefined }, transport);
}
