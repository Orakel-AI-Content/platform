CREATE TABLE "releases" (
	"tag" text PRIMARY KEY NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL
);
