import { relations, sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";

const id = () =>
  uuid("id")
    .default(sql`pg_catalog.gen_random_uuid()`)
    .primaryKey();

const timestamps = {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};

/** A space is one business or product collecting reviews through its own link. */
export const spaces = pgTable(
  "spaces",
  {
    id: id(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    category: text("category"),
    prompts: jsonb("prompts").$type<string[]>().notNull().default([]),
    ...timestamps,
  },
  (table) => [index("spaces_owner_id_idx").on(table.ownerId)],
);

export const reviewStatus = pgEnum("review_status", ["pending", "approved", "rejected"]);
export const reviewKind = pgEnum("review_kind", ["text", "video"]);

export const reviews = pgTable(
  "reviews",
  {
    id: id(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    status: reviewStatus("status").notNull().default("pending"),
    kind: reviewKind("kind").notNull(),
    rating: integer("rating").notNull(),
    text: text("text").notNull().default(""),
    videoKey: text("video_key"),
    authorName: text("author_name").notNull(),
    authorRole: text("author_role"),
    authorEmail: text("author_email").notNull(),
    authorPhotoKey: text("author_photo_key"),
    consent: boolean("consent").notNull(),
    /** Set when the reviewer clicks the link in the confirmation email. */
    emailVerifiedAt: timestamp("email_verified_at"),
    verifyToken: text("verify_token").unique(),
    decidedAt: timestamp("decided_at"),
    ...timestamps,
  },
  (table) => [index("reviews_space_status_idx").on(table.spaceId, table.status, table.createdAt)],
);

export const widgetLayout = pgEnum("widget_layout", ["wall", "carousel", "marquee"]);
export const widgetTheme = pgEnum("widget_theme", ["light", "dark", "auto"]);

export type WidgetSettings = {
  accent: string;
  maxReviews: number;
  minRating: number;
  showRating: boolean;
  showPhotos: boolean;
  showRole: boolean;
};

export const DEFAULT_WIDGET_SETTINGS: WidgetSettings = {
  accent: "#B3213F",
  maxReviews: 12,
  minRating: 4,
  showRating: true,
  showPhotos: true,
  showRole: true,
};

/** An embeddable display of a space's approved reviews. */
export const widgets = pgTable(
  "widgets",
  {
    id: id(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    layout: widgetLayout("layout").notNull().default("wall"),
    theme: widgetTheme("theme").notNull().default("auto"),
    settings: jsonb("settings").$type<WidgetSettings>().notNull().default(DEFAULT_WIDGET_SETTINGS),
    ...timestamps,
  },
  (table) => [index("widgets_space_id_idx").on(table.spaceId)],
);

export const spacesRelations = relations(spaces, ({ one, many }) => ({
  owner: one(users, { fields: [spaces.ownerId], references: [users.id] }),
  reviews: many(reviews),
  widgets: many(widgets),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  space: one(spaces, { fields: [reviews.spaceId], references: [spaces.id] }),
}));

export const widgetsRelations = relations(widgets, ({ one }) => ({
  space: one(spaces, { fields: [widgets.spaceId], references: [spaces.id] }),
}));

/** Mirrors Razorpay subscription states. https://razorpay.com/docs/payments/subscriptions/states/ */
export const subscriptionStatus = pgEnum("subscription_status", [
  "created",
  "authenticated",
  "active",
  "pending",
  "halted",
  "cancelled",
  "completed",
  "expired",
]);

export const billingInterval = pgEnum("billing_interval", ["monthly", "yearly"]);

/** One Razorpay subscription per account. Absence means the free plan. */
export const subscriptions = pgTable("subscriptions", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  razorpaySubscriptionId: text("razorpay_subscription_id").notNull().unique(),
  status: subscriptionStatus("status").notNull().default("created"),
  interval: billingInterval("interval").notNull().default("monthly"),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  ...timestamps,
});

/** Fixed-window counters for rate limiting public endpoints. Keys look like "review:<ip>". */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: timestamp("reset_at").notNull(),
});
