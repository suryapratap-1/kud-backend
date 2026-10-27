import { pino } from "pino";
import { env, isProduction } from "@/env";

/**
 * JSON lines in production (what hosting log viewers expect), readable colour output in development.
 * Secrets that can appear on a request are replaced before anything is written.
 */
export const logger = pino({
  level: env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      'req.headers["x-razorpay-signature"]',
      'res.headers["set-cookie"]',
    ],
    censor: "[redacted]",
  },
  transport: isProduction ? undefined : { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } },
});

/** Review confirmation and password reset links carry one-time tokens in the query string. */
export function redactUrl(url: string) {
  return url.replace(/([?&](?:token|verifyToken)=)[^&]*/gi, "$1[redacted]");
}
