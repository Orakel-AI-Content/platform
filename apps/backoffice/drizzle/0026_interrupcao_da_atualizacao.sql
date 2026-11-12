ALTER TABLE "release_rollouts" ADD COLUMN "interrupted_by" text;--> statement-breakpoint
ALTER TABLE "release_rollouts" ADD COLUMN "interrupted_at" timestamp with time zone;