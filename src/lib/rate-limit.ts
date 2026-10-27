import type { Request, Response } from "express";
import { lt, sql } from "drizzle-orm";
import { env } from "@/env";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";

/**
 * Counts one hit for `key` and reports whether it is within `limit` per `windowSeconds`.
 * One atomic upsert, so it holds across server instances without Redis.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const windowEnd = sql`now() + (${windowSeconds}::int * interval '1 second')`;
  const expired = sql`${rateLimits.resetAt} < now()`;
  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1, resetAt: windowEnd })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${expired} then 1 else ${rateLimits.count} + 1 end`,
        resetAt: sql`case when ${expired} then ${windowEnd} else ${rateLimits.resetAt} end`,
      },
    })
    .returning({ count: rateLimits.count, resetAt: rateLimits.resetAt });

  // Occasional cleanup of stale windows keeps the table small.
  if (Math.random() < 0.01) await db.delete(rateLimits).where(lt(rateLimits.resetAt, sql`now() - interval '1 day'`));

  return { ok: row.count <= limit, retryAfter: Math.max(1, Math.ceil((row.resetAt.getTime() - Date.now()) / 1000)) };
}

/**
 * The visitor's IP, from sources a visitor can't forge:
 * - CLIENT_IP_HEADER (e.g. "cf-connecting-ip"): a header the hosting platform overwrites on every request.
 * - Otherwise Express's req.ip, which honours exactly TRUST_PROXY hops of X-Forwarded-For.
 */
export function clientIp(req: Request) {
  const header = env.CLIENT_IP_HEADER?.toLowerCase();
  const fromHeader = header ? req.get(header)?.split(",")[0]?.trim() : undefined;
  return fromHeader || req.ip || "unknown";
}

export function tooManyRequests(res: Response, message: string, retryAfter: number) {
  res.set("Retry-After", String(retryAfter)).status(429).json({ error: message });
}
