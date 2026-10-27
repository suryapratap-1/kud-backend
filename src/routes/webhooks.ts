import express, { Router } from "express";
import { handleWebhook, verifyWebhookSignature } from "@/lib/billing";

export const webhooksRouter = Router();

// Razorpay → Settings → Webhooks. URL: <API_URL>/webhooks/razorpay, events: subscription.*
// The signature covers the exact bytes Razorpay sent, so this route reads the raw body.
webhooksRouter.post("/razorpay", express.raw({ type: "*/*", limit: "1mb" }), async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
  if (!verifyWebhookSignature(raw, req.get("x-razorpay-signature") ?? null)) {
    res.status(400).json({ error: "Invalid signature" });
    return;
  }
  await handleWebhook(JSON.parse(raw));
  res.json({ ok: true });
});
