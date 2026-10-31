CREATE TABLE "publications" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"content_id" integer NOT NULL,
	"version" integer NOT NULL,
	"published_by" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scheduled_for" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "daily_publish_limit" integer;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "publications_site_published_at_idx" ON "publications" USING btree ("site_id","published_at");--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_daily_publish_limit_check" CHECK ("sites"."daily_publish_limit" >= 0);