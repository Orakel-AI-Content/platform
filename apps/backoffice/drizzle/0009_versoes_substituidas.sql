-- Publicar uma versão leva as publicadas antes a `substituido` (#519). Aplica a regra ao
-- histórico existente: em cada conteúdo, só a maior versão `publicado` continua `publicado`.
-- Idempotente: rodar de novo não encontra mais nada para mudar.
UPDATE "content_versions" AS v
SET "status" = 'substituido'
WHERE v."status" = 'publicado'
  AND v."version" < (
    SELECT max(p."version") FROM "content_versions" AS p
    WHERE p."site_id" = v."site_id"
      AND p."content_id" = v."content_id"
      AND p."status" = 'publicado'
  );
