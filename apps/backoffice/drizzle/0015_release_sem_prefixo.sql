-- Migração de dados (#569): a release passou a ser a tag da imagem site-builder (X.Y.Z, #566);
-- os registros antigos guardavam a tag Git (core-vX.Y.Z). Só o formato exato core-vX.Y.Z é
-- convertido, então rodar de novo não acha nada. `builds.release` fica: é o histórico da imagem
-- que cada tentativa usou.
-- Colisão: core-vX.Y.Z e X.Y.Z juntos ficam numa linha X.Y.Z com o registro mais antigo.
UPDATE "releases" AS n
SET "registered_at" = LEAST(n."registered_at", o."registered_at")
FROM "releases" AS o
WHERE o."tag" ~ '^core-v[0-9]+\.[0-9]+\.[0-9]+$' AND n."tag" = substr(o."tag", 7);--> statement-breakpoint
DELETE FROM "releases" AS o
WHERE o."tag" ~ '^core-v[0-9]+\.[0-9]+\.[0-9]+$'
  AND EXISTS (SELECT 1 FROM "releases" AS n WHERE n."tag" = substr(o."tag", 7));--> statement-breakpoint
UPDATE "releases" SET "tag" = substr("tag", 7)
WHERE "tag" ~ '^core-v[0-9]+\.[0-9]+\.[0-9]+$';--> statement-breakpoint
UPDATE "sites" SET "release" = substr("release", 7)
WHERE "release" ~ '^core-v[0-9]+\.[0-9]+\.[0-9]+$';
