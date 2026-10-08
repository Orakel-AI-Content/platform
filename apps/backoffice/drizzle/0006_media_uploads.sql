CREATE TABLE "media_uploads" (
	"upload_key" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"original_name" text NOT NULL,
	"status" text DEFAULT 'processando' NOT NULL,
	"reason" text,
	"media_id" integer,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_uploads" ADD CONSTRAINT "media_uploads_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_uploads_site_uploaded_at_idx" ON "media_uploads" USING btree ("site_id","uploaded_at");