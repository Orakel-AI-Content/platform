CREATE TABLE "builds" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"release" text NOT NULL,
	"job_id" text,
	"attempt" integer NOT NULL,
	"status" text NOT NULL,
	"failed_stage" text,
	"failure_kind" text,
	"failure_message" text,
	"pending_change_ids" integer[] DEFAULT '{}' NOT NULL,
	"pages" integer,
	"files" integer,
	"version_id" text,
	"cache_key" text,
	"render_ms" integer,
	"publish_ms" integer,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "builds" ADD CONSTRAINT "builds_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "builds_site_id_finished_at_index" ON "builds" USING btree ("site_id","finished_at");