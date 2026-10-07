CREATE TABLE "reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"content_id" integer NOT NULL,
	"version" integer NOT NULL,
	"reviewer" text NOT NULL,
	"checklist" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;