import { and, avg, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { reviews, spaces, users } from "@/db/schema";
import type { PublicSpace } from "@/lib/types";
import { getPlan } from "./billing";

export async function getPublicSpace(slug: string): Promise<PublicSpace | undefined> {
  const [row] = await db
    .select({ id: spaces.id, slug: spaces.slug, name: spaces.name, category: spaces.category, prompts: spaces.prompts, ownerId: spaces.ownerId, ownerName: users.name })
    .from(spaces)
    .innerJoin(users, eq(users.id, spaces.ownerId))
    .where(eq(spaces.slug, slug))
    .limit(1);
  if (!row) return undefined;

  const [[stats], plan] = await Promise.all([
    db
    .select({ total: count(), average: avg(reviews.rating) })
    .from(reviews)
      .where(and(eq(reviews.spaceId, row.id), eq(reviews.status, "approved"))),
    getPlan(row.ownerId),
  ]);

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    ownerName: row.ownerName,
    prompts: row.prompts,
    allowVideo: plan === "pro",
    stats: { reviews: stats?.total ?? 0, average: Number(stats?.average ?? 0) },
  };
}
