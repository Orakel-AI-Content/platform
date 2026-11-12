ALTER TABLE "sites" ADD COLUMN "infra_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "infra_check_error" text;