# Kudos: project context

The decisions, history and current status behind this project, so any new session (human or Claude) can pick up where the last one stopped. `CLAUDE.md` holds the rules; this file holds the *why* and the *where we are*.

This file is kept identical in both repos (`wondering/docs/CONTEXT.md` and `kudos-api/docs/CONTEXT.md`). When you update one, copy it to the other.

Last updated: 2026-10-28.

---

## 1. The product

**Kudos** (working name) is a testimonial platform. A business:

1. **Collects** reviews by sharing one link (e.g. `kudos.app/glow-skin-studio`). Customers rate, write or upload a video review, add a photo, no login needed.
2. **Approves** them in a dashboard inbox (keyboard: `J`/`K` move, `A` approve, `R` reject, `U` back to pending).
3. **Shows** them on its own website with a one-line embeddable "Wall of Love" widget (wall, carousel or marquee), plus a public wall page at `/<space>/love`.

Target users: small businesses, coaches, clinics, creators and SaaS founders, India-first (UPI pricing, WhatsApp-friendly), usable globally.

### Plans
| | Free | Pro |
|---|---|---|
| Price | ₹0 | ₹799/month or ₹7,990/year (2 months free) |
| Spaces | 1 | Unlimited |
| Video reviews | No (option hidden) | Yes |
| Reviews per widget | Up to 15 | Up to 50 |
| "Powered by Kudos" on widgets | Shown | Removed |

Prices and limits live in `plans.ts` (frontend `apps/web/src/lib/billing/plans.ts`, backend `src/lib/plans.ts`; keep both in sync).

---

## 2. Design decisions (locked)

The owner strongly does **not** want the site to look AI-generated. These were chosen deliberately:

- **Colour:** 60-30-10 rule with **one** accent. Canvas off-white `#F9F7F7` (60%), deep ink `#22121A` (30%), **Ruby** `#B3213F` (10%; dark mode `#F0607C`). Ruby was picked because it means love and loyalty ("Wall of Love") and AI tools rarely choose it. Rejected: purple/indigo (AI cliché, competitors use it), Tailwind blue, emerald and teal (close to Tailwind defaults), multi-colour palettes.
- **Type:** Schibsted Grotesk for everything; Fragment Mono only for labels, code and numbers. **No serif** (italic serif accent words are an AI-site tell). No Inter, Geist or Poppins.
- **Avoid:** gradients, glows/blobs, emoji icons, centred paragraphs, identical three-card feature grids, shadows on every card, Tailwind default colours, invented testimonials or stats.
- **Signature elements:** a blocky ruby quote-mark logo reused as a section marker; an ink-stamp "Approved"/"Pending review" mark; real-looking numbers in mono; a hero that shows the product working (write → approve → appears on the wall).
- **Motion:** Framer Motion (`motion/react`), 160–240 ms, soft ease; the embeddable widget uses CSS-only animation.
- Design preview (for reference): https://claude.ai/artifact/EHDfZeNGfSm96octRMoquT

---

## 3. Architecture

Two repositories, side by side on disk:

```
projects/
├─ wondering/   ← FRONTEND (Next.js). Pages + embeddable widget. No database, no secrets.
└─ kudos-api/   ← BACKEND (Express 5 + TypeScript). Everything server-side.
```

### Frontend: `wondering`
- pnpm workspace: `apps/web` (Next.js 16, App Router, Cache Components, Tailwind v4, Motion) and `apps/widget` (embeddable `widget.js`: plain TypeScript, Shadow DOM, ~2.8 KB gzipped, no dependencies).
- `apps/widget/src/render.ts` is used both by `widget.js` and by the dashboard's live preview, so the preview is exactly what visitors see.
- Server components and server actions call the API through `src/lib/api/server.ts`, forwarding the visitor's session cookie. Browser code calls the API directly (`API_URL`, `credentials: "include"`). Login uses the Better Auth client pointed at `<API>/auth`.
- API response types are mirrored in `src/lib/api/types.ts`.

### Backend: `kudos-api`
- Express 5 + TypeScript, built with tsup, run with tsx in development.
- Postgres via Drizzle ORM; Better Auth (email + password with required email verification, optional Google); Nodemailer; Multer for uploads; Helmet; zod validation everywhere.
- Routes: `/auth/*` (Better Auth), `/public/*` (review page data, wall, review submission and confirmation, config), `/widgets/:id` and `/media/*` (any origin, no cookies), `/dashboard/*` (owner, login required), `/billing/*`, `/webhooks/razorpay`, `/health`.
- `src/env.ts` validates every setting at startup and refuses to start with a clear list if something required is missing.

### How they connect
- **Login:** session cookies set by the API. Locally `localhost:3000` and `localhost:4000` share cookies automatically. **In production both must be on one parent domain** (e.g. `app.kudos.com` + `api.kudos.com`) with `COOKIE_DOMAIN=.kudos.com` in the API.
- **Auth redirect URLs** (`callbackURL`, `redirectTo`) are absolute frontend URLs, because auth runs on the API's origin.
- **Uploads** go straight from the browser to the API.
- **Widget:** `widget.js` is served by the frontend; it fetches `<API>/widgets/:id`. The API address is baked in at build time from `NEXT_PUBLIC_API_URL`.
- **Emails:** sent by the API; links point to frontend pages (`/review-confirm`, `/reset-password`, `/dashboard`).

### Ports (local)
Frontend 3000 · API 4000 · Postgres 5434 (Docker) · Mailpit SMTP 1025, inbox UI 8025. Docker services are bound to `127.0.0.1` only.

---

## 4. Infrastructure and credentials (status, not values)

Secrets live only in git-ignored files: `kudos-api/.env` (backend) and `wondering/apps/web/.env.local` (frontend, public values only). Templates with explanations: `kudos-api/.env.example` and `apps/web/.env.example`.

| Service | Choice | Status |
|---|---|---|
| Database | Neon (Postgres) | **Connected** in `kudos-api/.env`; migrations applied. A local Docker Postgres is kept as a commented alternative. Neon starts empty: sign up through the app. |
| Email (dev) | Mailpit in Docker | Working; inbox at http://localhost:8025 |
| Login | Email + password; Google optional | Google keys **not set** (button hidden) |
| File storage | Cloudflare R2 (any S3-compatible) | **Not set**: uploads go to `kudos-api/.storage/` locally |
| Spam check | Cloudflare Turnstile | **Not set** (off). Test keys are listed in the `.env.example` files |
| Payments | Razorpay Subscriptions, test mode | **Not set**: billing page says "not set up yet". Run `pnpm billing:setup` in kudos-api after adding keys |

**To do:** the Neon password was pasted into a chat once. Reset it in the Neon dashboard (Roles → Reset password) before going live, and update `kudos-api/.env`.

Demo account (local Docker database only; the seed refuses remote databases): `demo@kudos.local` / `kudos-demo-123`.

---

## 5. What's built (all tested)

- Review collection page: 3 steps, live preview card, photo/video upload, CAPTCHA, thank-you screen with a stamp.
- Email verification of reviewers: the email opens a page with a "Yes, this is my review" button; only that button's POST verifies (email scanners can't auto-verify).
- Auth: sign-up with email confirmation, login, forgot/reset password, logout, optional Google.
- Dashboard: spaces (create, settings, rename, change link, delete with type-to-confirm), reviews inbox with keyboard shortcuts, widget list and designer (layout, theme, accent colour, min rating, count, card fields, live preview on light/dark site, script and iframe embed code), Plan & billing page.
- Public Wall of Love page; iframe embed page `/w/<id>`.
- Landing page (hero demo, Collect → Approve → Embed, live widget, pricing, FAQ).
- Billing: Razorpay Checkout (monthly/yearly), signature verification, webhooks (activation, renewal, cancellation keeps Pro until the period ends, halted drops to Free).

---

## 6. Security work done

A full scan was done on 2026-10-27 and every finding was fixed and tested:

1. **Uploads:** type allowlist (JPEG/PNG/WebP, MP4/MOV/WebM), file-signature check, server-chosen file names and content types, protective headers on served media.
2. **Upload size:** oversized or unsized bodies are refused before reading; Multer also enforces limits while streaming.
3. **Rate limiting:** Postgres-backed; visitor IP from `CLIENT_IP_HEADER` or Express `req.ip` with `TRUST_PROXY` hops (can't be spoofed with fake headers).
4. **Headers:** frontend blocks framing except `/w/`; API uses Helmet.
5. **Local services** listen on 127.0.0.1 only.
6. **Seed guard:** the demo seed refuses non-local databases unless `ALLOW_DEMO_SEED=true`.
7. **Input validation:** every API route validates params and bodies; owner routes are scoped to the user's own spaces (another user always gets 404).
8. **CAPTCHA** on the public review form (Turnstile, fails closed).
9. **Email scanners** can't verify reviews (POST-only verification).
10. **Deleting a space** also deletes reviewers' photos and videos.
11. **Dependencies:** `pnpm audit` clean (esbuild override for drizzle-kit's old loader).
12. **CSRF guard** on the API: state-changing requests from a foreign Origin get 403. CORS: cookie routes allow only the frontend; widget data and media allow any origin without cookies.

Tests used: a 37-check API test, a 20-check browser end-to-end test across both apps, plus targeted attack tests (SVG uploads, disguised files, 5 GB requests, spoofed IPs, cross-account access, foreign-origin POSTs).

---

## 7. Timeline

- **2026-10-27:** Idea chosen (testimonial wall). Design direction iterated to Ruby + Schibsted Grotesk. Built UI, then the full app in phases (backend + auth, reviews + verification + uploads, dashboard inbox, widgets + wall, landing + Razorpay). Closed launch gaps (forgot password, space settings, R2 storage, rate limiting, yearly billing). Security scan; fixed all findings. Switched to Neon.
- **2026-10-28:** Split into two repos: `wondering` (Next.js frontend) and `kudos-api` (Express + TypeScript backend), cookie auth on one parent domain. Verified with full API and end-to-end tests.

Commits so far (frontend): `init`, `Enhance media handling and security features`, `feat: implement Cloudflare Turnstile captcha for review submissions`. The repo split itself is **not committed yet**; `kudos-api` has no commits.

---

## 8. Open decisions and next steps

1. **Commit the split:** first commit in `kudos-api` (needs its own GitHub repo); commit the frontend changes in `wondering`.
2. **Hosting:** not chosen. If the frontend goes on Vercel that's fine (uploads go to the API now). The API needs a Node host (Railway, Render, Fly.io, a VPS…). Both must sit on one parent domain for the login cookie.
3. **Reset the Neon password** (see section 4).
4. **Fill in remaining credentials** when ready: R2, Turnstile, Razorpay test keys (+ `pnpm billing:setup`), Google OAuth.
5. **Possible next features:** admin back office for the operator (users, spaces, moderation, subscriptions, audit log); importing reviews from Google/X/LinkedIn/WhatsApp screenshots; direct-to-R2 video uploads with signed URLs for very large videos; account deletion.

---

## 9. Run it locally

```bash
# API (terminal 1)
cd kudos-api
docker compose up -d      # Mailpit (+ optional local Postgres)
pnpm dev                  # http://localhost:4000

# Frontend (terminal 2)
cd wondering
pnpm dev                  # http://localhost:3000
```

Read emails (sign-up confirmations, review confirmations, password resets) at http://localhost:8025.
