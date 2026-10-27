import { randomBytes } from "node:crypto";
import { openAsBlob } from "node:fs";
import { rm } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { type Request, type Response, Router } from "express";
import multer from "multer";
import { z } from "zod";
import { db } from "@/db";
import { reviews, spaces, users } from "@/db/schema";
import { env } from "@/env";
import { HttpError, valid } from "@/http";
import { googleEnabled } from "@/lib/auth";
import { getPlanForSpace } from "@/lib/billing";
import { verifyCaptcha } from "@/lib/captcha";
import { matchesSignature } from "@/lib/file-signature";
import { sendMail } from "@/lib/mail";
import { isPhotoType, isVideoType, MAX_PHOTO_BYTES } from "@/lib/media-types";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { MAX_VIDEO_BYTES, submissionSchema } from "@/lib/review-schema";
import { SLUG_PATTERN } from "@/lib/slug";
import { getPublicSpace } from "@/lib/spaces";
import { putFile } from "@/lib/storage";
import { approvedReviews } from "@/lib/widgets";

/** Routes anyone may call: the review page, the Wall of Love and review confirmation. */
export const publicRouter = Router();

const slugParam = z.string().regex(SLUG_PATTERN).max(40);

async function findSpace(slug: string) {
  const space = await getPublicSpace(valid(slugParam, slug, "Not found."));
  if (!space) throw new HttpError(404, "This review link doesn't exist.");
  return space;
}

// Which optional features this server has switched on, so the frontend only shows what works.
publicRouter.get("/config", (_req, res) => {
  res.set("Cache-Control", "public, max-age=300").json({ googleLogin: googleEnabled });
});

publicRouter.get("/spaces/:slug", async (req, res) => {
  res.json(await findSpace(req.params.slug));
});

publicRouter.get("/spaces/:slug/wall", async (req, res) => {
  const space = await findSpace(req.params.slug);
  res.json({ space, reviews: await approvedReviews(space.id) });
});

/* ---------- Review submission ---------- */

// Largest allowed video + photo, plus room for the text fields and multipart overhead.
const MAX_REQUEST_BYTES = MAX_VIDEO_BYTES + MAX_PHOTO_BYTES + 1024 * 1024;

// Files are written to temp files on disk (never held in memory) and Multer stops reading as soon as
// a file passes its limit. The temp files are removed when the request ends.
const upload = multer({
  storage: multer.diskStorage({}),
  limits: { fileSize: MAX_VIDEO_BYTES, files: 2, fields: 12, fieldSize: 16 * 1024, parts: 14 },
}).fields([
  { name: "video", maxCount: 1 },
  { name: "photo", maxCount: 1 },
]);

function parseUpload(req: Request, res: Response) {
  return new Promise<void>((resolve, reject) => upload(req, res, (error) => (error ? reject(error) : resolve())));
}

function uploadedFiles(files: Request["files"]) {
  return !files ? [] : Array.isArray(files) ? files : Object.values(files).flat();
}

/** The validation and storage code works with web File objects; these read from the temp file lazily. */
async function fileOrNull(files: Request["files"], name: string) {
  const file = !Array.isArray(files) ? files?.[name]?.[0] : undefined;
  if (!file || file.size === 0) return null;
  return new File([await openAsBlob(file.path)], file.originalname, { type: file.mimetype });
}

publicRouter.post("/spaces/:slug/reviews", async (req, res) => {
  const slug = valid(slugParam, req.params.slug, "Not found.");

  // Refuse oversized or unsized bodies before reading any of it.
  const declared = Number(req.get("content-length"));
  if (!declared) throw new HttpError(411, "Upload size is missing. Please try again.");
  if (declared > MAX_REQUEST_BYTES) throw new HttpError(413, "This upload is too large. Videos can be up to 100 MB.");

  // Per space: a real customer rarely sends more than a couple. Overall: stops one IP spamming many spaces.
  const ip = clientIp(req);
  for (const [key, limit, window] of [
    [`review:${slug}:${ip}`, 5, 600],
    [`review:${ip}`, 20, 3600],
  ] as const) {
    const { ok, retryAfter } = await rateLimit(key, limit, window);
    if (!ok) return tooManyRequests(res, "You've sent a lot of reviews in a short time. Please try again later.", retryAfter);
  }

  const [space] = await db
    .select({ id: spaces.id, name: spaces.name, ownerEmail: users.email, ownerName: users.name })
    .from(spaces)
    .innerJoin(users, eq(users.id, spaces.ownerId))
    .where(eq(spaces.slug, slug))
    .limit(1);
  if (!space) throw new HttpError(404, "This review link doesn't exist.");

  res.on("close", () => {
    for (const file of uploadedFiles(req.files)) void rm(file.path, { force: true });
  });
  await parseUpload(req, res);
  const body = req.body as Record<string, string | undefined>;

  if (!(await verifyCaptcha(body.captcha ?? null, ip))) {
    throw new HttpError(403, "The security check didn't pass. Please try it again.");
  }

  const parsed = submissionSchema.safeParse({
    rating: body.rating,
    mode: body.mode,
    text: body.text ?? "",
    video: await fileOrNull(req.files, "video"),
    photo: await fileOrNull(req.files, "photo"),
    name: body.name,
    role: body.role ?? "",
    email: body.email,
    consent: body.consent,
  });
  if (!parsed.success) {
    res.status(400).json({ error: "Some details are missing or invalid.", issues: parsed.error.issues });
    return;
  }
  const input = parsed.data;
  if (input.mode === "video" && (await getPlanForSpace(space.id)) !== "pro") {
    throw new HttpError(403, "This business accepts written reviews only.");
  }

  // The schema checked the claimed types; confirm the bytes match before anything is stored.
  const video =
    input.mode === "video" && input.video && isVideoType(input.video.type) ? { file: input.video, type: input.video.type } : null;
  const photo = input.photo && isPhotoType(input.photo.type) ? { file: input.photo, type: input.photo.type } : null;
  for (const item of [video, photo]) {
    if (item && !(await matchesSignature(item.file, item.type))) {
      throw new HttpError(400, "That file doesn't look like a real photo or video. Try another one.");
    }
  }

  const [videoKey, photoKey] = await Promise.all([
    video ? putFile("reviews/video", video.file, video.type) : null,
    photo ? putFile("reviews/photo", photo.file, photo.type) : null,
  ]);

  const verifyToken = randomBytes(24).toString("base64url");
  const [review] = await db
    .insert(reviews)
    .values({
      spaceId: space.id,
      kind: input.mode,
      rating: input.rating,
      text: input.text,
      videoKey,
      authorName: input.name,
      authorRole: input.role || null,
      authorEmail: input.email,
      authorPhotoKey: photoKey,
      consent: true,
      verifyToken,
    })
    .returning({ id: reviews.id });

  // Emails are best-effort: a mail outage shouldn't lose the review.
  const sent = await Promise.allSettled([
    sendMail({
      to: input.email,
      subject: `Confirm your review for ${space.name}`,
      text: `Hi ${input.name},\n\nThanks for reviewing ${space.name}. Confirm it's really you:\n${env.FRONTEND_URL}/review-confirm?token=${verifyToken}\n\nIf you didn't write this review, ignore this email.`,
    }),
    sendMail({
      to: space.ownerEmail,
      subject: `New ${input.rating}-star review from ${input.name}`,
      text: `Hi ${space.ownerName},\n\n${input.name} left a ${input.rating}-star ${input.mode} review for ${space.name}.\n\nReview it in your inbox: ${env.FRONTEND_URL}/dashboard/${slug}`,
    }),
  ]);
  for (const [i, result] of sent.entries()) {
    if (result.status === "rejected") {
      req.log.error({ err: result.reason, reviewId: review.id }, `Couldn't send ${i === 0 ? "reviewer confirmation" : "owner notification"} email`);
    }
  }

  res.status(201).json({ id: review.id });
});

/* ---------- Review confirmation ---------- */

const tokenSchema = z.string().min(16).max(64);

// Read-only: the frontend's confirm page shows who and what is being confirmed. Viewing never verifies.
publicRouter.get("/reviews/confirm", async (req, res) => {
  const token = valid(tokenSchema, req.query.token, "This link has expired.");
  const [review] = await db
    .select({ spaceName: spaces.name, authorName: reviews.authorName })
    .from(reviews)
    .innerJoin(spaces, eq(spaces.id, reviews.spaceId))
    .where(eq(reviews.verifyToken, token))
    .limit(1);
  if (!review) throw new HttpError(404, "This link has already been used or has expired.");
  res.json(review);
});

/**
 * The confirm page's button posts a plain HTML form here, and the browser follows the 303 back to
 * the frontend. Only this POST verifies: email scanners open links (GET) but don't submit forms.
 */
publicRouter.post("/reviews/verify", async (req, res) => {
  const done = (query: string) => res.redirect(303, `${env.FRONTEND_URL}/review-confirmed${query}`);
  const token = tokenSchema.safeParse(req.body?.token);
  if (!token.success) return done("?status=invalid");
  // Tokens are 192-bit random, but cap guessing anyway.
  if (!(await rateLimit(`verify:${clientIp(req)}`, 30, 600)).ok) return done("?status=invalid");

  const [review] = await db
    .update(reviews)
    .set({ emailVerifiedAt: new Date(), verifyToken: null })
    .where(eq(reviews.verifyToken, token.data))
    .returning({ spaceId: reviews.spaceId });
  if (!review) return done("?status=invalid");

  const [space] = await db.select({ name: spaces.name }).from(spaces).where(eq(spaces.id, review.spaceId)).limit(1);
  done(space ? `?space=${encodeURIComponent(space.name)}` : "");
});
