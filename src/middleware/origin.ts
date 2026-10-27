import type { RequestHandler } from "express";
import { env } from "@/env";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF guard for cookie-authenticated routes. Browsers always send Origin on cross-site and
 * state-changing requests, so a request carrying a foreign Origin is refused. Requests without
 * an Origin don't come from a victim's browser (e.g. the frontend server forwarding a cookie).
 */
export const requireTrustedOrigin: RequestHandler = (req, res, next) => {
  const origin = req.get("origin");
  if (SAFE_METHODS.has(req.method) || !origin || origin === env.FRONTEND_URL) {
    next();
    return;
  }
  res.status(403).json({ error: "This request came from a site that isn't allowed." });
};
