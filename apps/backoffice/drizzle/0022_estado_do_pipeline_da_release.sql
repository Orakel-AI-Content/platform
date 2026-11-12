ALTER TABLE "releases" ADD COLUMN "pipeline_state" text DEFAULT 'disponivel' NOT NULL;--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "run_id" text;--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "run_url" text;--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "requested_by" text;