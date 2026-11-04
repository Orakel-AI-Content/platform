CREATE TABLE "editorial_contexts" (
	"site_id" text NOT NULL,
	"version" integer NOT NULL,
	"body" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "editorial_contexts_site_id_version_pk" PRIMARY KEY("site_id","version")
);
--> statement-breakpoint
ALTER TABLE "editorial_contexts" ADD CONSTRAINT "editorial_contexts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;