// Plan rules shared by server checks and the pricing UI. Prices in INR.

export const FREE_LIMITS = {
  spaces: 1,
  widgetReviews: 15,
  video: false,
  branding: true,
} as const;

export const PRO_PRICE_MONTHLY = 799;
/** Two months free compared with paying monthly. */
export const PRO_PRICE_YEARLY = 7990;

export type BillingInterval = "monthly" | "yearly";

export const PLANS = {
  free: {
    name: "Free",
    price: 0,
    features: ["1 space", "Unlimited text reviews", `Show up to ${FREE_LIMITS.widgetReviews} reviews per widget`, "All widget layouts", "“Powered by Kudos” on widgets"],
  },
  pro: {
    name: "Pro",
    price: PRO_PRICE_MONTHLY,
    priceYearly: PRO_PRICE_YEARLY,
    features: ["Unlimited spaces", "Video reviews", "Show up to 50 reviews per widget", "No Kudos branding", "Priority email support"],
  },
} as const;

export type PlanId = keyof typeof PLANS;
