// Top-level routes that a space slug must never shadow.
const RESERVED = new Set(["api", "dashboard", "login", "signup", "review-confirmed", "review-confirm", "forgot-password", "reset-password", "pricing", "about", "blog", "help", "settings", "wall", "w", "admin", "billing", "new", "widget.js"]);

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .slice(0, 40);
}

export function isReservedSlug(slug: string) {
  return RESERVED.has(slug);
}
