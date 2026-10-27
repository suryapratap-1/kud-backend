import type { RequestHandler, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth, type Session } from "@/lib/auth";

/** Rejects requests without a valid session; the session is then available through `sessionOf(res)`. */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) {
    res.status(401).json({ error: "Please log in again." });
    return;
  }
  res.locals.session = session;
  next();
};

export function sessionOf(res: Response): Session {
  return res.locals.session as Session;
}
