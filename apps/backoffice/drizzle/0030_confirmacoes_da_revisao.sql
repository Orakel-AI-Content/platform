CREATE TABLE "review_confirmations" (
	"site_id" text NOT NULL,
	"content_id" integer NOT NULL,
	"version" integer NOT NULL,
	"key" text NOT NULL,
	"confirmed_by" text NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_confirmations_site_id_content_id_version_key_pk" PRIMARY KEY("site_id","content_id","version","key")
);
--> statement-breakpoint
ALTER TABLE "review_confirmations" ADD CONSTRAINT "review_confirmations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;