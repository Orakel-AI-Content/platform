ALTER TABLE "sites" ADD COLUMN "paused_culprit_origin" text;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "paused_culprit_reference" text;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "active_version_id" text;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_paused_culprit_check" CHECK (("sites"."paused_culprit_origin" is null) = ("sites"."paused_culprit_reference" is null));--> statement-breakpoint
-- Backfill (#510): até aqui a versão no ar era a do último build com sucesso. Idempotente:
-- só preenche sites ainda sem versão ativa.
UPDATE "sites" AS s
SET "active_version_id" = (
  SELECT b."version_id" FROM "builds" AS b
  WHERE b."site_id" = s."id" AND b."status" = 'ok'
  ORDER BY b."finished_at" DESC, b."id" DESC
  LIMIT 1
)
WHERE s."active_version_id" IS NULL;
