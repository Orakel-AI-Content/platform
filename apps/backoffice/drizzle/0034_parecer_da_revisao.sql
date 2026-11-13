CREATE TABLE "review_opinions" (
	"site_id" text NOT NULL,
	"content_id" integer NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"opinion" jsonb,
	"error" jsonb,
	"editorial_context_version" integer,
	"copied_from_version" integer,
	"prompt" jsonb,
	"provider" text,
	"model" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_usd" numeric(12, 6),
	"duration_ms" integer,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "review_opinions_site_id_content_id_version_pk" PRIMARY KEY("site_id","content_id","version"),
	CONSTRAINT "review_opinions_finished_check" CHECK (("review_opinions"."status" = 'pendente') = ("review_opinions"."finished_at" is null))
);
--> statement-breakpoint
ALTER TABLE "review_opinions" ADD CONSTRAINT "review_opinions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_opinions" ADD CONSTRAINT "review_opinions_version_fk" FOREIGN KEY ("site_id","content_id","version") REFERENCES "public"."content_versions"("site_id","content_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_opinions" ADD CONSTRAINT "review_opinions_editorial_context_fk" FOREIGN KEY ("site_id","editorial_context_version") REFERENCES "public"."editorial_contexts"("site_id","version") ON DELETE no action ON UPDATE no action;