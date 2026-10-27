import { env } from "@/env";
import type { WidgetPayload, WidgetReview } from "./widget-types";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { reviews, spaces, subscriptions, widgets } from "@/db/schema";
import { FREE_LIMITS } from "@/lib/plans";
import { planFromSubscription } from "./billing";
import { mediaUrl } from "./storage";

/** Approved reviews for a space, newest first, in the shape the widget renders. */
export async function approvedReviews(spaceId: string, { minRating = 1, limit = 100 } = {}): Promise<WidgetReview[]> {
  const rows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      text: reviews.text,
      authorName: reviews.authorName,
      authorRole: reviews.authorRole,
      authorPhotoKey: reviews.authorPhotoKey,
      videoKey: reviews.videoKey,
    })
    .from(reviews)
    .where(and(eq(reviews.spaceId, spaceId), eq(reviews.status, "approved"), gte(reviews.rating, minRating)))
    .orderBy(desc(reviews.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    rating: row.rating,
    text: row.text,
    authorName: row.authorName,
    authorRole: row.authorRole,
    photoUrl: mediaUrl(row.authorPhotoKey) ?? null,
    videoUrl: mediaUrl(row.videoKey) ?? null,
  }));
}

/*
 * Widget data is fetched by every page view on customers' sites, so payloads are kept in memory
 * for as long as browsers may cache them anyway (Cache-Control max-age=60 in routes/open.ts).
 * Per instance; dashboard edits clear their own entry.
 */
const CACHE_MS = 60_000;
const CACHE_MAX = 1000;
const payloadCache = new Map<string, { payload: WidgetPayload; expires: number }>();

export function forgetWidgetPayload(id: string) {
  payloadCache.delete(id);
}

/** Everything the embed script needs for one widget. */
export async function getWidgetPayload(id: string): Promise<WidgetPayload | undefined> {
  const cached = payloadCache.get(id);
  if (cached && cached.expires > Date.now()) return cached.payload;

  // Widget and the owner's plan in one query.
  const [row] = await db
    .select({
      widget: widgets,
      subscription: { status: subscriptions.status, currentPeriodEnd: subscriptions.currentPeriodEnd },
    })
    .from(widgets)
    .innerJoin(spaces, eq(spaces.id, widgets.spaceId))
    .leftJoin(subscriptions, eq(subscriptions.userId, spaces.ownerId))
    .where(eq(widgets.id, id))
    .limit(1);
  if (!row) return undefined;
  const { widget } = row;
  const { accent, showRating, showPhotos, showRole, minRating, maxReviews } = widget.settings;
  const pro = planFromSubscription(row.subscription) === "pro";
  const payload: WidgetPayload = {
    layout: widget.layout,
    theme: widget.theme,
    settings: { accent, showRating, showPhotos, showRole },
    reviews: await approvedReviews(widget.spaceId, {
      minRating,
      limit: pro ? maxReviews : Math.min(maxReviews, FREE_LIMITS.widgetReviews),
    }),
    branding: { show: !pro, url: env.FRONTEND_URL },
  };

  if (payloadCache.size >= CACHE_MAX) payloadCache.clear();
  payloadCache.set(id, { payload, expires: Date.now() + CACHE_MS });
  return payload;
}

export async function listSpaceWidgets(spaceId: string) {
  return db.select().from(widgets).where(eq(widgets.spaceId, spaceId)).orderBy(asc(widgets.createdAt));
}

export async function getOwnedWidget(userId: string, widgetId: string) {
  const [row] = await db
    .select({ widget: widgets, space: spaces })
    .from(widgets)
    .innerJoin(spaces, eq(spaces.id, widgets.spaceId))
    .where(and(eq(widgets.id, widgetId), eq(spaces.ownerId, userId)))
    .limit(1);
  return row;
}
