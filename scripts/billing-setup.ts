/*
 * Creates the "Kudos Pro" monthly and yearly plans in Razorpay and prints their ids.
 * Run once per Razorpay account (test and live separately): `pnpm billing:setup`
 */
import { PRO_PRICE_MONTHLY, PRO_PRICE_YEARLY } from "../src/lib/plans";

const { RAZORPAY_KEY_ID: keyId, RAZORPAY_KEY_SECRET: secret } = process.env;
if (!keyId || !secret) {
  console.error("Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in apps/web/.env.local first.");
  process.exit(1);
}

async function createPlan(period: "monthly" | "yearly", rupees: number) {
  const response = await fetch("https://api.razorpay.com/v1/plans", {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString("base64")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      period,
      interval: 1,
      item: { name: "Kudos Pro", amount: rupees * 100, currency: "INR", description: `Kudos Pro, billed ${period}` },
    }),
  });
  if (!response.ok) throw new Error(`Razorpay returned ${response.status}: ${await response.text()}`);
  return ((await response.json()) as { id: string }).id;
}

async function main() {
  const monthly = await createPlan("monthly", PRO_PRICE_MONTHLY);
  const yearly = await createPlan("yearly", PRO_PRICE_YEARLY);
  console.log(`Created plans. Add these lines to apps/web/.env.local:\n\nRAZORPAY_PLAN_ID=${monthly}\nRAZORPAY_PLAN_ID_YEARLY=${yearly}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
