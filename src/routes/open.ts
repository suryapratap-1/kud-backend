import path from "node:path";
import { Router } from "express";
import { HttpError, idSchema, valid } from "@/http";
import { PHOTO_TYPES, VIDEO_TYPES } from "@/lib/media-types";
import { getLocalFile } from "@/lib/storage";
import { getWidgetPayload } from "@/lib/widgets";

/*
 * Read-only routes loaded by customers' own websites (the embed script and its images/videos),
 * so they answer any origin and never use cookies. Mounted at /widgets and /media.
 */
export const widgetDataRouter = Router();
export const mediaRouter = Router();

widgetDataRouter.get("/:id", async (req, res) => {
  const payload = await getWidgetPayload(valid(idSchema, req.params.id, "Widget not found."));
  if (!payload) throw new HttpError(404, "Widget not found.");
  res.set("Cache-Control", "public, max-age=60, s-maxage=60, stale-while-revalidate=300").json(payload);
});

// Built from the upload allowlist, so only photo and video types are ever served.
const TYPES: Record<string, string> = Object.fromEntries(
  Object.entries({ ...PHOTO_TYPES, ...VIDEO_TYPES }).map(([type, extension]) => [extension, type]),
);

// Local development storage only; with a bucket configured, files are served by the bucket itself.
mediaRouter.get("/{*key}", async (req, res) => {
  const key = (req.params as { key: string[] }).key.join("/");
  const contentType = TYPES[path.extname(key).toLowerCase()];
  if (!contentType) throw new HttpError(404, "Not found.");
  const file = await getLocalFile(key).catch(() => null);
  if (!file) throw new HttpError(404, "Not found.");
  res
    .set({
      "Content-Type": contentType,
      "Content-Length": String(file.size),
      "Cache-Control": "public, max-age=31536000, immutable",
      // Never let a browser guess a different type or run anything inside a stored file.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    })
    .send(file.data);
});
