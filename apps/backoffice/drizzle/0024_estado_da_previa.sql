CREATE TABLE "preview_state" (
	"id" text PRIMARY KEY DEFAULT 'preview' NOT NULL,
	"current_release" text,
	"target_release" text,
	"status" text NOT NULL,
	"failure_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preview_state_single_row" CHECK ("preview_state"."id" = 'preview')
);
