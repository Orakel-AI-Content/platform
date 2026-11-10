ALTER TABLE "releases" ADD COLUMN "image_status" text;--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "image_checked_at" timestamp with time zone;