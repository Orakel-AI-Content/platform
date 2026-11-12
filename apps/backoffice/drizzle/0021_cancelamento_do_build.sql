ALTER TABLE "builds" ADD COLUMN "cancel_requested_by" text;--> statement-breakpoint
ALTER TABLE "builds" ADD COLUMN "cancel_requested_at" timestamp with time zone;