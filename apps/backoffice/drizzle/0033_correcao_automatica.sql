ALTER TABLE "generation_runs" ALTER COLUMN "editorial_context_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_runs" ALTER COLUMN "topic" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_runs" ALTER COLUMN "author_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "kind" text DEFAULT 'geracao' NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "base_version" integer;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "review_id" integer;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_base_version_fk" FOREIGN KEY ("site_id","content_id","base_version") REFERENCES "public"."content_versions"("site_id","content_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_geracao_check" CHECK ("generation_runs"."kind" <> 'geracao' or ("generation_runs"."topic" is not null and "generation_runs"."author_id" is not null and "generation_runs"."editorial_context_version" is not null and "generation_runs"."base_version" is null and "generation_runs"."review_id" is null));--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_correcao_check" CHECK ("generation_runs"."kind" <> 'correcao' or ("generation_runs"."content_id" is not null and "generation_runs"."base_version" is not null and "generation_runs"."review_id" is not null and "generation_runs"."topic" is null and "generation_runs"."author_id" is null));