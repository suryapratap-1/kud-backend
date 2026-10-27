import { env } from "@/env";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { spaces, subscriptions } from "@/db/schema";
import type { BillingInterval, PlanId } from "@/lib/plans";

type SubscriptionStatus = (typeof subscriptions.$inferSelect)["status"];

export class BillingNotConfiguredError extends Error {
  constructor() {
    super("Razorpay keys are not set. Add RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_PLAN_ID to .env.local.");
  }
}

const planIdFor = (interval: BillingInterval) =>
  interval === "yearly" ? env.RAZORPAY_PLAN_ID_YEARLY : env.RAZORPAY_PLAN_ID;

export function billingConfigured() {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_PLAN_ID);
}

/** Yearly is offered only once its Razorpay plan exists. */
export function yearlyAvailable() {
  return billingConfigured() && Boolean(env.RAZORPAY_PLAN_ID_YEARLY);
}

type RazorpaySubscription = {
  id: string;
  status: SubscriptionStatus;
  current_end: number | null;
};

async function razorpay<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { RAZORPAY_KEY_ID: keyId, RAZORPAY_KEY_SECRET: secret } = env;
  if (!keyId || !secret) throw new BillingNotConfiguredError();
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (!response.ok) throw new Error(`Razorpay ${path} failed (${response.status}): ${await response.text()}`);
  return response.json() as Promise<T>;
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

const hmac = (secret: string, payload: string) => createHmac("sha256", secret).update(payload).digest("hex");

/* ---------- Plan lookup ---------- */

// Pending = Razorpay is retrying a failed renewal; keep access during the retry window.
const PAID_STATUSES: SubscriptionStatus[] = ["authenticated", "active", "pending"];

export async function getSubscription(userId: string) {
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  return row;
}

export async function getPlan(userId: string): Promise<PlanId> {
  const row = await getSubscription(userId);
  if (!row) return "free";
  if (PAID_STATUSES.includes(row.status)) return "pro";
  // Cancelled subscriptions keep Pro until the period they paid for ends.
  if (row.status === "cancelled" && row.currentPeriodEnd && row.currentPeriodEnd > new Date()) return "pro";
  return "free";
}

export async function getPlanForSpace(spaceId: string): Promise<PlanId> {
  const [space] = await db.select({ ownerId: spaces.ownerId }).from(spaces).where(eq(spaces.id, spaceId)).limit(1);
  return space ? getPlan(space.ownerId) : "free";
}

/* ---------- Checkout ---------- */

export async function createSubscription(userId: string, interval: BillingInterval) {
  const planId = planIdFor(interval);
  if (!planId) throw new BillingNotConfiguredError();

  const subscription = await razorpay<RazorpaySubscription>("/subscriptions", {
    method: "POST",
    // total_count is required by Razorpay; both values cover 10 years.
    body: { plan_id: planId, total_count: interval === "yearly" ? 10 : 120, customer_notify: 1, notes: { userId } },
  });

  const values = { razorpaySubscriptionId: subscription.id, status: subscription.status, interval, cancelAtPeriodEnd: false };
  await db
    .insert(subscriptions)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: subscriptions.userId, set: values });

  return subscription.id;
}

/** Signature Razorpay Checkout returns after the first payment of a subscription. */
export function verifyCheckoutSignature(paymentId: string, subscriptionId: string, signature: string) {
  const secret = env.RAZORPAY_KEY_SECRET;
  if (!secret) throw new BillingNotConfiguredError();
  return safeEqual(hmac(secret, `${paymentId}|${subscriptionId}`), signature);
}

export async function applySubscriptionState(entity: RazorpaySubscription) {
  await db
    .update(subscriptions)
    .set({
      status: entity.status,
      currentPeriodEnd: entity.current_end ? new Date(entity.current_end * 1000) : undefined,
    })
    .where(eq(subscriptions.razorpaySubscriptionId, entity.id));
}

/** Pulls the latest state from Razorpay, used right after checkout. */
export async function syncSubscription(subscriptionId: string) {
  await applySubscriptionState(await razorpay<RazorpaySubscription>(`/subscriptions/${subscriptionId}`));
}

export async function cancelSubscription(userId: string) {
  const row = await getSubscription(userId);
  if (!row) return;
  const entity = await razorpay<RazorpaySubscription>(`/subscriptions/${row.razorpaySubscriptionId}/cancel`, {
    method: "POST",
    body: { cancel_at_cycle_end: 1 },
  });
  await applySubscriptionState(entity);
  await db.update(subscriptions).set({ cancelAtPeriodEnd: true }).where(eq(subscriptions.id, row.id));
}

/* ---------- Webhooks ---------- */

export function verifyWebhookSignature(rawBody: string, signature: string | null) {
  const secret = env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  return safeEqual(hmac(secret, rawBody), signature);
}

type WebhookEvent = {
  event: string;
  payload: { subscription?: { entity: RazorpaySubscription } };
};

export async function handleWebhook(event: WebhookEvent) {
  const entity = event.payload.subscription?.entity;
  if (event.event.startsWith("subscription.") && entity) await applySubscriptionState(entity);
}
