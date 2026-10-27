import { z } from "zod";
import { isPhotoType, isVideoType, MAX_PHOTO_BYTES } from "@/lib/media-types";

// Mirrors the frontend form's limits; the server is the one that enforces them.

export const MAX_REVIEW_LENGTH = 600;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

/** Server-side check of a full submission (multipart form data from the review page). */
export const submissionSchema = z
  .object({
    rating: z.coerce.number().int().min(1).max(5),
    mode: z.enum(["text", "video"]),
    text: z.string().trim().max(MAX_REVIEW_LENGTH).default(""),
    video: z.instanceof(File).nullable(),
    photo: z.instanceof(File).nullable(),
    name: z.string().trim().min(2).max(80),
    role: z.string().trim().max(60).default(""),
    email: z.email(),
    consent: z.literal("true"),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "text" && value.text.length < 20) {
      ctx.addIssue({ code: "custom", path: ["text"], message: "Review is too short." });
    }
    if (value.mode === "video") {
      if (!value.video || !isVideoType(value.video.type)) {
        ctx.addIssue({ code: "custom", path: ["video"], message: "An MP4, MOV or WebM video is required." });
      } else if (value.video.size > MAX_VIDEO_BYTES) {
        ctx.addIssue({ code: "custom", path: ["video"], message: "Video is over 100 MB." });
      }
    }
    if (value.photo && (!isPhotoType(value.photo.type) || value.photo.size > MAX_PHOTO_BYTES)) {
      ctx.addIssue({ code: "custom", path: ["photo"], message: "Photo must be a JPEG, PNG or WebP under 5 MB." });
    }
  });
