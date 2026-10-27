import { env } from "@/env";
import type { WidgetPayload, WidgetReview } from "./widget-types";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { reviews, spaces, widgets } from "@/db/schema";
import { FREE_LIMITS } from "@/lib/plans";
import { getPlanForSpace } from "./billing";
import { mediaUrl } from "./storage";

/** Approved reviews for a space, newest first, in the shape the widget renders. */
export async function approvedReviews(spaceId: string, { minRating = 1, limit = 100 } = {}): Promise<WidgetReview[]> {
  const rows = await db
    .select()
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

/** Everything the embed script needs for one widget. */
export async function getWidgetPayload(id: string): Promise<WidgetPayload | undefined> {
  const [widget] = await db.select().from(widgets).where(eq(widgets.id, id)).limit(1);
  if (!widget) return undefined;
  const { accent, showRating, showPhotos, showRole, minRating, maxReviews } = widget.settings;
  const pro = (await getPlanForSpace(widget.spaceId)) === "pro";
  return {
    layout: widget.layout,
    theme: widget.theme,
    settings: { accent, showRating, showPhotos, showRole },
    reviews: await approvedReviews(widget.spaceId, {
      minRating,
      limit: pro ? maxReviews : Math.min(maxReviews, FREE_LIMITS.widgetReviews),
    }),
    branding: { show: !pro, url: env.FRONTEND_URL },
  };
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
