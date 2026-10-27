import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectsCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "@/env";
import { extensionFor, type MediaType } from "@/lib/media-types";

/*
 * File storage for review videos and photos. Keys look like "reviews/video/<uuid>.mp4".
 * With STORAGE_BUCKET set it uses any S3-compatible bucket (Cloudflare R2 in production);
 * otherwise it writes to a local .storage/ folder served by GET /media/* for development.
 */

const bucket = env.STORAGE_BUCKET;

const s3 = bucket
  ? new S3Client({
      region: "auto",
      endpoint: env.STORAGE_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.STORAGE_ACCESS_KEY_ID ?? "",
        secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY ?? "",
      },
    })
  : null;

const LOCAL_ROOT = path.join(process.cwd(), ".storage");

function localPath(key: string) {
  const full = path.join(LOCAL_ROOT, key);
  if (!full.startsWith(LOCAL_ROOT + path.sep)) throw new Error("Invalid storage key");
  return full;
}

/** `type` must already be validated (allowlist + file signature); it decides the extension and Content-Type. */
export async function putFile(folder: string, file: File, type: MediaType) {
  const key = `${folder}/${randomUUID()}${extensionFor(type)}`;
  const body = Buffer.from(await file.arrayBuffer());

  if (s3) {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: type,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  } else {
    const full = localPath(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  }
  return key;
}

/** Removes stored files. Missing files are ignored, so it is safe to call twice. */
export async function deleteFiles(keys: string[]) {
  if (keys.length === 0) return;
  if (s3) {
    // S3 deletes at most 1,000 objects per request.
    for (let start = 0; start < keys.length; start += 1000) {
      const batch = keys.slice(start, start + 1000).map((Key) => ({ Key }));
      await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: batch, Quiet: true } }));
    }
  } else {
    await Promise.all(keys.map((key) => rm(localPath(key), { force: true })));
  }
}

/** Local development only; bucket files are served directly by the bucket's public URL. */
export async function getLocalFile(key: string) {
  const full = localPath(key);
  const [data, info] = await Promise.all([readFile(full), stat(full)]);
  return { data, size: info.size };
}

/** Absolute public URL for a stored file: the bucket's public URL, or this API in local development. */
export function mediaUrl(key: string | null | undefined) {
  if (!key) return undefined;
  return s3 ? `${env.STORAGE_PUBLIC_URL?.replace(/\/$/, "")}/${key}` : `${env.API_URL}/media/${key}`;
}
