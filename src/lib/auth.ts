import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import { env, isProduction } from "@/env";
import { logger } from "./logger";
import { sendMail } from "./mail";

export const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

/** Set by our own middleware from Express's req.ip, after removing any value a client sent. */
export const CLIENT_IP_HEADER_INTERNAL = "x-kudos-client-ip";

export const auth = betterAuth({
  appName: "Kudos",
  baseURL: env.API_URL,
  basePath: "/auth",
  secret: env.BETTER_AUTH_SECRET,
  // Only the frontend may send users here (callback and redirect URLs are checked against this).
  trustedOrigins: [env.FRONTEND_URL],
  database: drizzleAdapter(db, { provider: "pg", usePlural: true }),
  // Send Better Auth's own messages through our logger so they share its format and level.
  logger: { log: (level, message, ...args) => logger[level]({ args }, message) },
  advanced: {
    database: { generateId: "uuid" },
    // In production the frontend (app.kudos.com) and API (api.kudos.com) share the session cookie
    // through the parent domain, so pages rendered on the frontend server can forward it.
    crossSubDomainCookies: env.COOKIE_DOMAIN ? { enabled: true, domain: env.COOKIE_DOMAIN } : undefined,
    ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER_INTERNAL] },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    sendResetPassword: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "Reset your Kudos password",
        text: `Hi ${user.name},\n\nReset your password here: ${url}\n\nIf you didn't ask for this, you can ignore this email.`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "Confirm your email for Kudos",
        text: `Hi ${user.name},\n\nConfirm your email to start collecting reviews: ${url}`,
      });
    },
  },
  socialProviders: googleEnabled
    ? { google: { clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET! } }
    : undefined,
  // In-memory per server instance. Move to secondary storage (Redis) when running several instances.
  rateLimit: {
    enabled: isProduction,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 300, max: 5 },
      "/request-password-reset": { window: 300, max: 3 },
      "/send-verification-email": { window: 300, max: 3 },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
