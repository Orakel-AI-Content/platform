CREATE TABLE "site_policy_triggers" (
	"site_id" text NOT NULL,
	"trigger" text NOT NULL,
	"registered_by" text NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	CONSTRAINT "site_policy_triggers_site_id_trigger_pk" PRIMARY KEY("site_id","trigger")
);
--> statement-breakpoint
ALTER TABLE "site_policy_triggers" ADD CONSTRAINT "site_policy_triggers_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;