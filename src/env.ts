import { z } from "zod";

/*
 * Every setting the API reads, checked once at startup. A missing required value stops the
 * server with a clear message instead of failing later on the first request that needs it.
 */
const optional = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined);

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().default(4000),

  // Where this API is reachable from browsers (used in emails, media links, auth callbacks).
  API_URL: z.url(),
  // The Next.js frontend. Only this origin may call the API with cookies.
  FRONTEND_URL: z.url(),
  // Parent domain shared by the frontend and API in production, e.g. ".kudos.com". Empty locally.
  COOKIE_DOMAIN: optional,

  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),

  // Number of reverse proxies in front of the API (Express "trust proxy"). 0 when exposed directly.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  CLIENT_IP_HEADER: optional,

  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,

  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_USER: optional,
  SMTP_PASSWORD: optional,
  MAIL_FROM: z.string().default("Kudos <hello@kudos.local>"),

  STORAGE_ENDPOINT: optional,
  STORAGE_BUCKET: optional,
  STORAGE_ACCESS_KEY_ID: optional,
  STORAGE_SECRET_ACCESS_KEY: optional,
  STORAGE_PUBLIC_URL: optional,

  TURNSTILE_SECRET_KEY: optional,

  RAZORPAY_KEY_ID: optional,
  RAZORPAY_KEY_SECRET: optional,
  RAZORPAY_WEBHOOK_SECRET: optional,
  RAZORPAY_PLAN_ID: optional,
  RAZORPAY_PLAN_ID_YEARLY: optional,

  ALLOW_DEMO_SEED: optional,
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid configuration in .env:");
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  API_URL: parsed.data.API_URL.replace(/\/$/, ""),
  FRONTEND_URL: parsed.data.FRONTEND_URL.replace(/\/$/, ""),
};
export const isProduction = env.NODE_ENV === "production";
