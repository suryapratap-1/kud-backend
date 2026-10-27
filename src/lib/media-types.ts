// The only upload types accepted anywhere. The server stores files under the extension and
// content type listed here, never the ones a visitor's browser claims.

export const PHOTO_TYPES = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
} as const;

export const VIDEO_TYPES = {
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
} as const;

export type MediaType = keyof typeof PHOTO_TYPES | keyof typeof VIDEO_TYPES;

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export const PHOTO_ACCEPT = Object.keys(PHOTO_TYPES).join(",");
export const VIDEO_ACCEPT = Object.keys(VIDEO_TYPES).join(",");

export const isPhotoType = (type: string): type is keyof typeof PHOTO_TYPES => type in PHOTO_TYPES;
export const isVideoType = (type: string): type is keyof typeof VIDEO_TYPES => type in VIDEO_TYPES;

export function extensionFor(type: MediaType) {
  return isPhotoType(type) ? PHOTO_TYPES[type] : VIDEO_TYPES[type];
}
