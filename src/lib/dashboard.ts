import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { reviews, spaces } from "@/db/schema";
import { mediaUrl } from "./storage";

export async function listOwnedSpaces(userId: string) {
  return db
    .select({ id: spaces.id, slug: spaces.slug, name: spaces.name })
    .from(spaces)
    .where(eq(spaces.ownerId, userId))
    .orderBy(asc(spaces.createdAt));
}

export async function getOwnedSpace(userId: string, slug: string) {
  const [space] = await db
    .select()
    .from(spaces)
    .where(and(eq(spaces.ownerId, userId), eq(spaces.slug, slug)))
    .limit(1);
  return space;
}

export type InboxReview = {
  id: string;
  status: "pending" | "approved" | "rejected";
  kind: "text" | "video";
  rating: number;
  text: string;
  authorName: string;
  authorRole: string | null;
  authorEmail: string;
  photoUrl?: string;
  videoUrl?: string;
  emailVerified: boolean;
  createdAt: string;
};

export async function listSpaceReviews(spaceId: string): Promise<InboxReview[]> {
  const rows = await db.select().from(reviews).where(eq(reviews.spaceId, spaceId)).orderBy(desc(reviews.createdAt));
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    kind: row.kind,
    rating: row.rating,
    text: row.text,
    authorName: row.authorName,
    authorRole: row.authorRole,
    authorEmail: row.authorEmail,
    photoUrl: mediaUrl(row.authorPhotoKey),
    videoUrl: mediaUrl(row.videoKey),
    emailVerified: row.emailVerifiedAt !== null,
    createdAt: row.createdAt.toISOString(),
  }));
}
