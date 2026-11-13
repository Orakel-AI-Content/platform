ALTER TABLE "sites" ADD COLUMN "infra_drift_status" text;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "infra_drift_summary" text;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "infra_drift_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "infra_drift_error" text;