import type { MediaType } from "@/lib/media-types";

/*
 * Checks a file's first bytes against its claimed type, so a script or HTML page
 * can't be uploaded by simply labelling it "image/png".
 */

const ascii = (bytes: Uint8Array, start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));

const startsWith = (bytes: Uint8Array, signature: number[]) => signature.every((byte, index) => bytes[index] === byte);

// ISO base media (MP4/MOV) files begin with a box whose type sits at bytes 4–8.
const MP4_BOXES = new Set(["ftyp"]);
const MOV_BOXES = new Set(["ftyp", "moov", "mdat", "wide", "free", "skip"]);

export async function matchesSignature(file: File, type: MediaType) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (bytes.length < 12) return false;

  switch (type) {
    case "image/jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP";
    case "video/webm":
      return startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
    case "video/mp4":
      return MP4_BOXES.has(ascii(bytes, 4, 8));
    case "video/quicktime":
      return MOV_BOXES.has(ascii(bytes, 4, 8));
  }
}
