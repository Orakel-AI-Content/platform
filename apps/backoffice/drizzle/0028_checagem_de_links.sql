CREATE TABLE "content_link_checks" (
	"site_id" text NOT NULL,
	"content_id" integer NOT NULL,
	"version" integer NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "content_link_checks_site_id_content_id_version_pk" PRIMARY KEY("site_id","content_id","version")
);
--> statement-breakpoint
CREATE TABLE "content_link_results" (
	"site_id" text NOT NULL,
	"content_id" integer NOT NULL,
	"version" integer NOT NULL,
	"block_n" integer NOT NULL,
	"url" text NOT NULL,
	"ok" boolean NOT NULL,
	"reason" text,
	CONSTRAINT "content_link_results_site_id_content_id_version_block_n_url_pk" PRIMARY KEY("site_id","content_id","version","block_n","url")
);
--> statement-breakpoint
ALTER TABLE "content_link_checks" ADD CONSTRAINT "content_link_checks_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_link_results" ADD CONSTRAINT "content_link_results_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;