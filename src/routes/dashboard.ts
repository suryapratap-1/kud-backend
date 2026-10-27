import { and, eq, inArray } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { db } from "@/db";
import { reviews, spaces, widgets } from "@/db/schema";
import { HttpError, idSchema, valid } from "@/http";
import { getPlan } from "@/lib/billing";
import { getOwnedSpace, listOwnedSpaces, listSpaceReviews } from "@/lib/dashboard";
import { FREE_LIMITS } from "@/lib/plans";
import { isReservedSlug, SLUG_PATTERN } from "@/lib/slug";
import { deleteFiles } from "@/lib/storage";
import { approvedReviews, getOwnedWidget, listSpaceWidgets } from "@/lib/widgets";
import { requireAuth, sessionOf } from "@/middleware/auth";

/**
 * Everything a logged-in business owner can see or change. Each route validates its input,
 * then scopes every query to spaces the session's user owns.
 */
export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

const slugParam = z.string().regex(SLUG_PATTERN).max(40);

async function ownedSpaceOr404(userId: string, slug: unknown) {
  const space = await getOwnedSpace(userId, valid(slugParam, slug, "Space not found."));
  if (!space) throw new HttpError(404, "Space not found.");
  return space;
}

dashboardRouter.get("/me", async (_req, res) => {
  const { user } = sessionOf(res);
  const [spaceList, plan] = await Promise.all([listOwnedSpaces(user.id), getPlan(user.id)]);
  res.json({ user: { id: user.id, name: user.name, email: user.email }, plan, spaces: spaceList });
});

/* ---------- Spaces ---------- */

const DEFAULT_PROMPTS = ["What made you choose us?", "What changed after working with us?", "Who would you recommend us to?"];

const spaceSchema = z.object({
  name: z.string().trim().min(2, "Give your space a name.").max(60, "Keep the name under 60 characters."),
  slug: z
    .string()
    .trim()
    .min(3, "Use at least 3 characters for the link.")
    .max(40, "Keep the link under 40 characters.")
    .regex(SLUG_PATTERN, "Use lowercase letters, numbers and single dashes only.")
    .refine((slug) => !isReservedSlug(slug), "That link is reserved. Try another one."),
  category: z.string().trim().max(80).optional(),
  prompts: z.string().max(2000).optional(),
});

type FieldErrors = Partial<Record<"name" | "slug" | "form", string>>;

/** Space forms answer 400 with per-field messages the frontend shows next to each input. */
function parseSpace(body: unknown): { errors: FieldErrors } | { values: typeof spaces.$inferInsert & { slug: string } } {
  const parsed = spaceSchema.safeParse(body);
  if (!parsed.success) {
    const errors: FieldErrors = {};
    for (const issue of parsed.error.issues) errors[issue.path[0] as "name" | "slug"] ??= issue.message;
    return { errors };
  }
  const prompts = (parsed.data.prompts ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5);
  return {
    values: {
      ownerId: "",
      name: parsed.data.name,
      slug: parsed.data.slug,
      category: parsed.data.category || null,
      prompts: prompts.length ? prompts : DEFAULT_PROMPTS,
    },
  };
}

async function slugTaken(slug: string, exceptSpaceId?: string) {
  const [taken] = await db.select({ id: spaces.id }).from(spaces).where(eq(spaces.slug, slug)).limit(1);
  return Boolean(taken && taken.id !== exceptSpaceId);
}

dashboardRouter.post("/spaces", async (req, res) => {
  const { user } = sessionOf(res);
  const form = parseSpace(req.body);
  if ("errors" in form) return void res.status(400).json({ errors: form.errors });

  if ((await getPlan(user.id)) === "free") {
    const owned = await db.select({ id: spaces.id }).from(spaces).where(eq(spaces.ownerId, user.id));
    if (owned.length >= FREE_LIMITS.spaces) {
      return void res.status(403).json({ errors: { form: "The Free plan includes 1 space. Upgrade to Pro to add more." } });
    }
  }
  if (await slugTaken(form.values.slug)) {
    return void res.status(409).json({ errors: { slug: "That link is already taken. Try another one." } });
  }

  await db.insert(spaces).values({ ...form.values, ownerId: user.id });
  res.status(201).json({ slug: form.values.slug });
});

dashboardRouter.get("/spaces/:slug", async (req, res) => {
  const space = await ownedSpaceOr404(sessionOf(res).user.id, req.params.slug);
  res.json({
    id: space.id,
    slug: space.slug,
    name: space.name,
    category: space.category,
    prompts: space.prompts,
    updatedAt: space.updatedAt,
  });
});

dashboardRouter.patch("/spaces/:id", async (req, res) => {
  const { user } = sessionOf(res);
  const spaceId = valid(idSchema, req.params.id, "Space not found.");
  const form = parseSpace(req.body);
  if ("errors" in form) return void res.status(400).json({ errors: form.errors });

  const owned = and(eq(spaces.id, spaceId), eq(spaces.ownerId, user.id));
  const [space] = await db.select({ id: spaces.id }).from(spaces).where(owned).limit(1);
  if (!space) throw new HttpError(404, "Space not found.");
  if (await slugTaken(form.values.slug, spaceId)) {
    return void res.status(409).json({ errors: { slug: "That link is already taken. Try another one." } });
  }

  const { ownerId: _ignored, ...values } = form.values;
  await db.update(spaces).set(values).where(owned);
  res.json({ slug: values.slug });
});

dashboardRouter.delete("/spaces/:id", async (req, res) => {
  const { user } = sessionOf(res);
  const spaceId = valid(idSchema, req.params.id, "Space not found.");
  const owned = and(eq(spaces.id, spaceId), eq(spaces.ownerId, user.id));

  // Reviewers' videos and photos are personal data, so they leave with the space.
  // Collect their keys first: deleting the space cascades to the review rows that hold them.
  const files = await db
    .select({ video: reviews.videoKey, photo: reviews.authorPhotoKey })
    .from(reviews)
    .innerJoin(spaces, eq(spaces.id, reviews.spaceId))
    .where(owned);

  const [deleted] = await db.delete(spaces).where(owned).returning({ id: spaces.id });
  if (!deleted) throw new HttpError(404, "Space not found.");
  const keys = files.flatMap((row) => [row.video, row.photo]).filter((key): key is string => Boolean(key));
  // The space is already gone; a storage hiccup shouldn't turn that into an error for the owner.
  await deleteFiles(keys).catch((error) => console.error(`Couldn't remove files for space ${deleted.id}`, error));
  res.status(204).end();
});

/* ---------- Reviews ---------- */

dashboardRouter.get("/spaces/:slug/reviews", async (req, res) => {
  const space = await ownedSpaceOr404(sessionOf(res).user.id, req.params.slug);
  res.json({ space: { id: space.id, slug: space.slug, name: space.name }, reviews: await listSpaceReviews(space.id) });
});

const statusSchema = z.object({ status: z.enum(["pending", "approved", "rejected"]) });

dashboardRouter.patch("/reviews/:id", async (req, res) => {
  const { user } = sessionOf(res);
  const reviewId = valid(idSchema, req.params.id, "Review not found.");
  const { status } = valid(statusSchema, req.body);
  const owned = db.select({ id: spaces.id }).from(spaces).where(eq(spaces.ownerId, user.id));
  const [updated] = await db
    .update(reviews)
    .set({ status, decidedAt: status === "pending" ? null : new Date() })
    .where(and(eq(reviews.id, reviewId), inArray(reviews.spaceId, owned)))
    .returning({ id: reviews.id });
  if (!updated) throw new HttpError(404, "Review not found.");
  res.status(204).end();
});

/* ---------- Widgets ---------- */

const widgetSchema = z.object({
  name: z.string().trim().min(1, "Give the widget a name.").max(60),
  layout: z.enum(["wall", "carousel", "marquee"]),
  theme: z.enum(["light", "dark", "auto"]),
  settings: z.object({
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex color like #B3213F."),
    maxReviews: z.number().int().min(3).max(50),
    minRating: z.number().int().min(1).max(5),
    showRating: z.boolean(),
    showPhotos: z.boolean(),
    showRole: z.boolean(),
  }),
});

async function ownedWidgetOr404(userId: string, id: unknown) {
  const owned = await getOwnedWidget(userId, valid(idSchema, id, "Widget not found."));
  if (!owned) throw new HttpError(404, "Widget not found.");
  return owned;
}

dashboardRouter.get("/spaces/:slug/widgets", async (req, res) => {
  const space = await ownedSpaceOr404(sessionOf(res).user.id, req.params.slug);
  res.json({ space: { id: space.id, slug: space.slug, name: space.name }, widgets: await listSpaceWidgets(space.id) });
});

dashboardRouter.post("/spaces/:slug/widgets", async (req, res) => {
  const space = await ownedSpaceOr404(sessionOf(res).user.id, req.params.slug);
  const existing = await db.select({ id: widgets.id }).from(widgets).where(eq(widgets.spaceId, space.id));
  const [widget] = await db
    .insert(widgets)
    .values({ spaceId: space.id, name: existing.length ? `Widget ${existing.length + 1}` : "Homepage wall" })
    .returning({ id: widgets.id });
  res.status(201).json({ id: widget.id });
});

dashboardRouter.get("/widgets/:id", async (req, res) => {
  const { user } = sessionOf(res);
  const { widget, space } = await ownedWidgetOr404(user.id, req.params.id);
  const [reviewList, plan] = await Promise.all([approvedReviews(space.id, { limit: 50 }), getPlan(user.id)]);
  res.json({
    widget: { id: widget.id, name: widget.name, layout: widget.layout, theme: widget.theme, settings: widget.settings },
    space: { id: space.id, slug: space.slug, name: space.name },
    reviews: reviewList,
    plan,
  });
});

dashboardRouter.patch("/widgets/:id", async (req, res) => {
  const { widget } = await ownedWidgetOr404(sessionOf(res).user.id, req.params.id);
  const parsed = widgetSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Check the widget settings.");
  await db.update(widgets).set(parsed.data).where(eq(widgets.id, widget.id));
  res.status(204).end();
});

dashboardRouter.delete("/widgets/:id", async (req, res) => {
  const { widget } = await ownedWidgetOr404(sessionOf(res).user.id, req.params.id);
  await db.delete(widgets).where(eq(widgets.id, widget.id));
  res.status(204).end();
});
