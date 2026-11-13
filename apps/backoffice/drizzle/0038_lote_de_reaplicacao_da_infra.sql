CREATE TABLE "infra_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"state" text DEFAULT 'planejando' NOT NULL,
	"requested_by" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "infra_batches_finished_check" CHECK ((state in ('planejando', 'aguardando_confirmacao', 'aplicando')) = (finished_at is null))
);
--> statement-breakpoint
ALTER TABLE "infra_runs" ADD COLUMN "batch_id" integer;--> statement-breakpoint
ALTER TABLE "infra_runs" ADD COLUMN "batch_position" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "infra_batches_open_unique" ON "infra_batches" USING btree ((true)) WHERE state in ('planejando', 'aguardando_confirmacao', 'aplicando');--> statement-breakpoint
ALTER TABLE "infra_runs" ADD CONSTRAINT "infra_runs_batch_id_infra_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."infra_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infra_runs" ADD CONSTRAINT "infra_runs_batch_position_unique" UNIQUE("batch_id","batch_position");--> statement-breakpoint
ALTER TABLE "infra_runs" ADD CONSTRAINT "infra_runs_batch_check" CHECK (("infra_runs"."batch_id" is null) = ("infra_runs"."batch_position" is null));