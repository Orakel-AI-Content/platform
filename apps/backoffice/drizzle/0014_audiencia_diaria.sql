CREATE TABLE "audience_daily_article" (
	"site_id" text NOT NULL,
	"article_id" integer NOT NULL,
	"day" date NOT NULL,
	"views" integer NOT NULL,
	"sessions" integer NOT NULL,
	CONSTRAINT "audience_daily_article_site_id_article_id_day_pk" PRIMARY KEY("site_id","article_id","day"),
	CONSTRAINT "audience_daily_article_counts_check" CHECK ("audience_daily_article"."views" >= 0 and "audience_daily_article"."sessions" >= 0)
);
--> statement-breakpoint
CREATE TABLE "audience_daily_site" (
	"site_id" text NOT NULL,
	"day" date NOT NULL,
	"views" integer NOT NULL,
	"sessions" integer NOT NULL,
	CONSTRAINT "audience_daily_site_site_id_day_pk" PRIMARY KEY("site_id","day"),
	CONSTRAINT "audience_daily_site_counts_check" CHECK ("audience_daily_site"."views" >= 0 and "audience_daily_site"."sessions" >= 0)
);
--> statement-breakpoint
ALTER TABLE "audience_daily_article" ADD CONSTRAINT "audience_daily_article_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audience_daily_site" ADD CONSTRAINT "audience_daily_site_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audience_daily_article_day_idx" ON "audience_daily_article" USING btree ("day");--> statement-breakpoint
CREATE INDEX "audience_daily_site_day_idx" ON "audience_daily_site" USING btree ("day");