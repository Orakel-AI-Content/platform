CREATE TABLE "authors" (
	"site_id" text NOT NULL,
	"id" integer NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"bio" text,
	"expertise" text,
	"avatar_media_id" integer,
	CONSTRAINT "authors_site_id_id_pk" PRIMARY KEY("site_id","id"),
	CONSTRAINT "authors_siteId_slug_unique" UNIQUE("site_id","slug")
);
--> statement-breakpoint
CREATE TABLE "content_versions" (
	"site_id" text NOT NULL,
	"content_id" integer NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_versions_site_id_content_id_version_pk" PRIMARY KEY("site_id","content_id","version")
);
--> statement-breakpoint
CREATE TABLE "contents" (
	"site_id" text NOT NULL,
	"id" integer NOT NULL,
	"kind" text NOT NULL,
	"next_block_n" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contents_site_id_id_pk" PRIMARY KEY("site_id","id")
);
--> statement-breakpoint
CREATE TABLE "media" (
	"site_id" text NOT NULL,
	"id" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	CONSTRAINT "media_site_id_id_pk" PRIMARY KEY("site_id","id")
);
--> statement-breakpoint
CREATE TABLE "media_variants" (
	"site_id" text NOT NULL,
	"media_id" integer NOT NULL,
	"width" integer NOT NULL,
	"format" text NOT NULL,
	"path" text NOT NULL,
	CONSTRAINT "media_variants_site_id_media_id_width_format_pk" PRIMARY KEY("site_id","media_id","width","format")
);
--> statement-breakpoint
CREATE TABLE "menus" (
	"site_id" text NOT NULL,
	"id" integer NOT NULL,
	"key" text NOT NULL,
	"items" jsonb NOT NULL,
	CONSTRAINT "menus_site_id_id_pk" PRIMARY KEY("site_id","id"),
	CONSTRAINT "menus_siteId_key_unique" UNIQUE("site_id","key")
);
--> statement-breakpoint
CREATE TABLE "redirects" (
	"site_id" text NOT NULL,
	"id" integer NOT NULL,
	"from" text NOT NULL,
	"to" text NOT NULL,
	"status" integer NOT NULL,
	"origin" text NOT NULL,
	CONSTRAINT "redirects_site_id_id_pk" PRIMARY KEY("site_id","id"),
	CONSTRAINT "redirects_siteId_from_unique" UNIQUE("site_id","from")
);
--> statement-breakpoint
CREATE TABLE "taxonomies" (
	"site_id" text NOT NULL,
	"id" integer NOT NULL,
	"kind" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	CONSTRAINT "taxonomies_site_id_id_pk" PRIMARY KEY("site_id","id"),
	CONSTRAINT "taxonomies_siteId_kind_slug_unique" UNIQUE("site_id","kind","slug")
);
--> statement-breakpoint
CREATE TABLE "pending_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"origin" text NOT NULL,
	"reference" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" integer NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "site_configs" (
	"site_id" text NOT NULL,
	"version" integer NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_configs_site_id_version_pk" PRIMARY KEY("site_id","version")
);
--> statement-breakpoint
CREATE TABLE "site_sequences" (
	"site_id" text NOT NULL,
	"entity" text NOT NULL,
	"last" integer NOT NULL,
	CONSTRAINT "site_sequences_site_id_entity_pk" PRIMARY KEY("site_id","entity")
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"lifecycle" text DEFAULT 'cadastrado' NOT NULL,
	"state" text DEFAULT 'ativo' NOT NULL,
	"paused_reason" text,
	"release" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "authors" ADD CONSTRAINT "authors_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contents" ADD CONSTRAINT "contents_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_variants" ADD CONSTRAINT "media_variants_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menus" ADD CONSTRAINT "menus_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redirects" ADD CONSTRAINT "redirects_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomies" ADD CONSTRAINT "taxonomies_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_changes" ADD CONSTRAINT "pending_changes_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_configs" ADD CONSTRAINT "site_configs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_sequences" ADD CONSTRAINT "site_sequences_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;