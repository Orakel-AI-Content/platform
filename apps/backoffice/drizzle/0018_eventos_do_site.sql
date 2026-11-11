CREATE TABLE "site_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"kind" text NOT NULL,
	"requested_by" text NOT NULL,
	"reason" text,
	"culprit_origin" text,
	"culprit_reference" text,
	"previous_release" text,
	"release" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_events" ADD CONSTRAINT "site_events_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_events_site_id_created_at_index" ON "site_events" USING btree ("site_id","created_at");