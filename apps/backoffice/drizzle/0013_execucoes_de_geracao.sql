CREATE TABLE "generation_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"editorial_context_version" integer NOT NULL,
	"topic" text NOT NULL,
	"author_id" integer NOT NULL,
	"created_by" text NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"content_id" integer,
	"prompt" jsonb,
	"provider" text,
	"model" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_usd" numeric(12, 6),
	"duration_ms" integer,
	"error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "generation_runs_finished_check" CHECK (("generation_runs"."status" = 'pendente') = ("generation_runs"."finished_at" is null))
);
--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_editorial_context_fk" FOREIGN KEY ("site_id","editorial_context_version") REFERENCES "public"."editorial_contexts"("site_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generation_runs_site_created_idx" ON "generation_runs" USING btree ("site_id","created_at");