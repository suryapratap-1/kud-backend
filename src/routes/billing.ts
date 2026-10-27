import { Router } from "express";
import { z } from "zod";
import { HttpError, valid } from "@/http";
import {
  BillingNotConfiguredError,
  billingConfigured,
  cancelSubscription,
  createSubscription,
  getPlan,
  getSubscription,
  syncSubscription,
  verifyCheckoutSignature,
  yearlyAvailable,
} from "@/lib/billing";
import { env } from "@/env";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { requireAuth, sessionOf } from "@/middleware/auth";

export const billingRouter = Router();
billingRouter.use(requireAuth);

billingRouter.get("/", async (_req, res) => {
  const { user } = sessionOf(res);
  const [plan, subscription] = await Promise.all([getPlan(user.id), getSubscription(user.id)]);
  res.json({
    plan,
    subscription: subscription
      ? {
          status: subscription.status,
          interval: subscription.interval,
          currentPeriodEnd: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        }
      : null,
    configured: billingConfigured(),
    yearlyAvailable: yearlyAvailable(),
  });
});

const subscribeSchema = z.object({ interval: z.enum(["monthly", "yearly"]).default("monthly") });

billingRouter.post("/subscribe", async (req, res) => {
  const { user } = sessionOf(res);
  const limited = await rateLimit(`subscribe:${user.id}`, 5, 600);
  if (!limited.ok) return tooManyRequests(res, "Too many checkout attempts. Wait a few minutes and try again.", limited.retryAfter);
  if ((await getPlan(user.id)) === "pro") throw new HttpError(409, "You're already on Pro.");
  const { interval } = valid(subscribeSchema, req.body ?? {});

  try {
    const subscriptionId = await createSubscription(user.id, interval);
    // The key id is public by design (Razorpay Checkout needs it in the browser); the secret never leaves the server.
    res.json({ subscriptionId, keyId: env.RAZORPAY_KEY_ID, user: { name: user.name, email: user.email } });
  } catch (error) {
    if (error instanceof BillingNotConfiguredError) throw new HttpError(503, error.message);
    console.error(error);
    throw new HttpError(502, "We couldn't start checkout. Try again in a minute.");
  }
});

const verifySchema = z.object({
  razorpay_payment_id: z.string().min(1).max(100),
  razorpay_subscription_id: z.string().min(1).max(100),
  razorpay_signature: z.string().min(1).max(200),
});

billingRouter.post("/verify", async (req, res) => {
  const { user } = sessionOf(res);
  const body = valid(verifySchema, req.body, "Missing payment details.");
  const own = await getSubscription(user.id);
  if (
    own?.razorpaySubscriptionId !== body.razorpay_subscription_id ||
    !verifyCheckoutSignature(body.razorpay_payment_id, body.razorpay_subscription_id, body.razorpay_signature)
  ) {
    throw new HttpError(400, "We couldn't verify this payment.");
  }
  await syncSubscription(body.razorpay_subscription_id);
  res.json({ ok: true });
});

billingRouter.post("/cancel", async (_req, res) => {
  try {
    await cancelSubscription(sessionOf(res).user.id);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    throw new HttpError(502, "We couldn't cancel right now. Try again in a minute.");
  }
});
