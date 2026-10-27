CREATE TYPE "public"."widget_layout" AS ENUM('wall', 'carousel', 'marquee');--> statement-breakpoint
CREATE TYPE "public"."widget_theme" AS ENUM('light', 'dark', 'auto');--> statement-breakpoint
CREATE TABLE "widgets" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"name" text NOT NULL,
	"layout" "widget_layout" DEFAULT 'wall' NOT NULL,
	"theme" "widget_theme" DEFAULT 'auto' NOT NULL,
	"settings" jsonb DEFAULT '{"accent":"#B3213F","maxReviews":12,"minRating":4,"showRating":true,"showPhotos":true,"showRole":true}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "widgets" ADD CONSTRAINT "widgets_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "widgets_space_id_idx" ON "widgets" USING btree ("space_id");