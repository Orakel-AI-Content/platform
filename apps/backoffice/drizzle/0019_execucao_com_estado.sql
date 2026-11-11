ALTER TABLE "builds" ALTER COLUMN "started_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "builds" ALTER COLUMN "finished_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "builds" ALTER COLUMN "finished_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "builds" ADD COLUMN "kind" text DEFAULT 'build' NOT NULL;--> statement-breakpoint
ALTER TABLE "builds" ADD COLUMN "current_stage" text;--> statement-breakpoint
ALTER TABLE "builds" ADD COLUMN "requested_by" text;--> statement-breakpoint
ALTER TABLE "builds" ADD COLUMN "scheduled_for" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "builds" ADD COLUMN "log_tail" text;--> statement-breakpoint
ALTER TABLE "builds" ADD CONSTRAINT "builds_finished_check" CHECK (("builds"."status" in ('na_fila', 'rodando')) = ("builds"."finished_at" is null));