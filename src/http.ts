import type { ErrorRequestHandler } from "express";
import multer from "multer";
import { z } from "zod";

/** Throw from any route to answer with a status and a user-facing message. Express 5 forwards async throws. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const idSchema = z.uuid();

/** Validates a route parameter or body field; anything malformed is a 400, never a database error. */
export function valid<T>(schema: z.ZodType<T>, value: unknown, message = "Invalid request."): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, message);
  return result.data;
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof multer.MulterError) {
    const tooLarge = error.code === "LIMIT_FILE_SIZE" || error.code === "LIMIT_FIELD_VALUE";
    res.status(tooLarge ? 413 : 400).json({
      error: tooLarge ? "This upload is too large. Videos can be up to 100 MB." : "We couldn't read that upload. Please try again.",
    });
    return;
  }
  // body-parser marks its own errors (bad JSON, body too large) with a status.
  if (typeof error?.status === "number" && error.status < 500) {
    res.status(error.status).json({ error: "Invalid request." });
    return;
  }
  console.error(error);
  res.status(500).json({ error: "Something went wrong on our side. Please try again." });
};
