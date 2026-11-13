CREATE TABLE "infra_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"status" text NOT NULL,
	"current_step" text,
	"plan_summary" text,
	"requested_by" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_by" text,
	"confirmed_at" timestamp with time zone,
	"nameservers" text[],
	"failed_step" text,
	"failure_message" text,
	"finished_at" timestamp with time zone,
	CONSTRAINT "infra_runs_finished_check" CHECK (("infra_runs"."status" in ('planejando', 'aguardando_confirmacao', 'aplicando')) = ("infra_runs"."finished_at" is null))
);
--> statement-breakpoint
ALTER TABLE "infra_runs" ADD CONSTRAINT "infra_runs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "infra_runs_site_id_finished_at_index" ON "infra_runs" USING btree ("site_id","finished_at");--> statement-breakpoint
CREATE UNIQUE INDEX "infra_runs_open_site_unique" ON "infra_runs" USING btree ("site_id") WHERE "infra_runs"."status" in ('planejando', 'aguardando_confirmacao', 'aplicando');