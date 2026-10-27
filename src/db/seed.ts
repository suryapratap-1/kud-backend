/*
 * Demo data: a verified owner account, one space and a mix of reviews.
 * Run with `pnpm db:seed`. Safe to re-run: it skips if the demo account exists.
 * Only runs against a local database unless ALLOW_DEMO_SEED=true.
 */
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "./index";
import { reviews, spaces, users, widgets } from "./schema";

const DEMO = { name: "Kavya Rao", email: "demo@kudos.local", password: "kudos-demo-123" };

const DEMO_REVIEWS = [
  { status: "pending", rating: 5, authorName: "Priya Sharma", authorRole: "Teacher, Indiranagar", verified: true, hoursAgo: 2,
    text: "I came in for stubborn acne marks that nothing else had fixed. Dr. Kavya explained every step before starting, and after four sessions my skin is clearer than it has been in years." },
  { status: "pending", rating: 4, authorName: "Rahul Kapoor", authorRole: "Product designer", verified: false, hoursAgo: 9,
    text: "Booking was easy and the clinic is spotless. Results took a little longer than I expected, but the team checked in after every session." },
  { status: "pending", rating: 5, authorName: "Sneha Iyer", authorRole: null, verified: true, hoursAgo: 30,
    text: "Finally a clinic that tells you what you don't need. Saved me money and my skin is calmer than ever." },
  { status: "approved", rating: 5, authorName: "Ananya Mishra", authorRole: "Founder, Leafbox", verified: true, hoursAgo: 72,
    text: "Finally a studio that explains what they are doing. I recommend them to everyone who asks about my skin." },
  { status: "approved", rating: 5, authorName: "Meera Nair", authorRole: "Yoga instructor", verified: true, hoursAgo: 120,
    text: "Three months in and my skin has never been better. The follow-up messages after each session are a lovely touch." },
  { status: "rejected", rating: 2, authorName: "Test User", authorRole: null, verified: false, hoursAgo: 200,
    text: "testing testing the review form to see if it works" },
] as const;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** The demo password is public in this repository, so never create the account on a shared database by accident. */
function assertLocalDatabase() {
  let host: string;
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    throw new Error("DATABASE_URL is missing or invalid. Check apps/web/.env.local.");
  }
  if (LOCAL_HOSTS.has(host) || process.env.ALLOW_DEMO_SEED === "true") return;
  throw new Error(
    `Refusing to seed ${host}: the demo account's password is public. ` +
      "Seed only local databases, or set ALLOW_DEMO_SEED=true for a throwaway staging database.",
  );
}

async function main() {
  assertLocalDatabase();
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, DEMO.email)).limit(1);
  if (existing) {
    console.log(`Demo account already exists. Log in with ${DEMO.email} / ${DEMO.password}`);
    return;
  }

  const { user } = await auth.api.signUpEmail({ body: DEMO });
  await db.update(users).set({ emailVerified: true }).where(eq(users.id, user.id));

  const [space] = await db
    .insert(spaces)
    .values({
      ownerId: user.id,
      slug: "glow-skin-studio",
      name: "Glow Skin Studio",
      category: "Skin clinic · Bengaluru",
      prompts: ["What brought you to us in the first place?", "What changed after your treatment?", "Who would you recommend us to?"],
    })
    .returning({ id: spaces.id });

  await db.insert(reviews).values(
    DEMO_REVIEWS.map((review) => {
      const createdAt = new Date(Date.now() - review.hoursAgo * 3_600_000);
      return {
        spaceId: space.id,
        status: review.status,
        kind: "text" as const,
        rating: review.rating,
        text: review.text,
        authorName: review.authorName,
        authorRole: review.authorRole,
        authorEmail: `${review.authorName.split(" ")[0].toLowerCase()}@example.com`,
        consent: true,
        emailVerifiedAt: review.verified ? createdAt : null,
        decidedAt: review.status === "pending" ? null : createdAt,
        createdAt,
        updatedAt: createdAt,
      };
    }),
  );

  await db.insert(widgets).values({ spaceId: space.id, name: "Homepage wall", layout: "marquee" });

  console.log(`Seeded. Log in with ${DEMO.email} / ${DEMO.password}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
