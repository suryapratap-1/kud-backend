import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "@/env";
import { errorHandler } from "@/http";
import { auth, CLIENT_IP_HEADER_INTERNAL } from "@/lib/auth";
import { clientIp } from "@/lib/rate-limit";
import { requireTrustedOrigin } from "@/middleware/origin";
import { billingRouter } from "@/routes/billing";
import { dashboardRouter } from "@/routes/dashboard";
import { mediaRouter, widgetDataRouter } from "@/routes/open";
import { publicRouter } from "@/routes/public";
import { webhooksRouter } from "@/routes/webhooks";

export function createApp() {
  const app = express();

  // How many proxies sit in front of us; Express then reads exactly that many X-Forwarded-For hops.
  app.set("trust proxy", env.TRUST_PROXY);
  app.disable("x-powered-by");

  // Media and widget data are loaded by other sites, so resources may be read cross-origin.
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

  // Hand Better Auth's rate limiter the IP we trust, overwriting anything a client sent in that header.
  app.use((req, _res, next) => {
    req.headers[CLIENT_IP_HEADER_INTERNAL] = clientIp(req);
    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  // Embed script data and media: any website may read them, never with cookies.
  // Each CORS policy is mounted on its own paths so it can't leak onto the cookie routes below.
  const anyOrigin = cors({ origin: "*", credentials: false });
  app.use("/widgets", anyOrigin, widgetDataRouter);
  app.use("/media", anyOrigin, mediaRouter);

  // Server-to-server from Razorpay; parses its own raw body for signature checks.
  app.use("/webhooks", webhooksRouter);

  // Everything below is called by the frontend with the session cookie.
  const frontendOnly = cors({ origin: env.FRONTEND_URL, credentials: true });

  // Better Auth reads the body itself, so it is mounted before the JSON parser.
  app.all("/auth/{*any}", frontendOnly, toNodeHandler(auth));

  app.use(express.json({ limit: "100kb" }));
  // The review confirmation page posts a plain HTML form.
  app.use(express.urlencoded({ extended: false, limit: "10kb" }));

  app.use("/public", frontendOnly, requireTrustedOrigin, publicRouter);
  app.use("/dashboard", frontendOnly, requireTrustedOrigin, dashboardRouter);
  app.use("/billing", frontendOnly, requireTrustedOrigin, billingRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found." });
  });
  app.use(errorHandler);

  return app;
}
