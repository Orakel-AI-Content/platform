CREATE TABLE "release_rollout_sites" (
	"rollout_id" integer NOT NULL,
	"site_id" text NOT NULL,
	"position" integer NOT NULL,
	"state" text NOT NULL,
	"previous_release" text,
	CONSTRAINT "release_rollout_sites_rollout_id_site_id_pk" PRIMARY KEY("rollout_id","site_id"),
	CONSTRAINT "release_rollout_sites_position_unique" UNIQUE("rollout_id","position")
);
--> statement-breakpoint
CREATE TABLE "release_rollouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"target_release" text NOT NULL,
	"state" text DEFAULT 'em_andamento' NOT NULL,
	"requested_by" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "release_rollout_sites" ADD CONSTRAINT "release_rollout_sites_rollout_id_release_rollouts_id_fk" FOREIGN KEY ("rollout_id") REFERENCES "public"."release_rollouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_rollout_sites" ADD CONSTRAINT "release_rollout_sites_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_rollouts" ADD CONSTRAINT "release_rollouts_target_release_releases_tag_fk" FOREIGN KEY ("target_release") REFERENCES "public"."releases"("tag") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "release_rollouts_open_unique" ON "release_rollouts" USING btree ("state") WHERE "release_rollouts"."state" = 'em_andamento';