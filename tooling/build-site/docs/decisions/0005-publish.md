# 0005 – Publish: dois alvos, build-cache, contrato com o edge-local

- Status: aceito
- Data: 2026-09-30

- Só publica se `result.json` diz `ok` para o mesmo site; senão, falha permanente.
- Compacta o artefato num `tar.gz` com o layout `ARCHIVE_LAYOUT` do contrato: `site/`, `worker/index.js` (o Worker empacotado por `wrangler deploy --dry-run`, o mesmo bundle da release) e `wrangler.jsonc` do alvo com `main: ./worker/index.js`. Quem recebe (edge-local, build-cache) não precisa do código-fonte — descoberto no scaffold do edge-local, cujo container não tem o `apps/blog/worker`.
- `DEPLOY_TARGET=cloudflare`: `wrangler deploy --config`; a versão vem do arquivo de saída do wrangler (`WRANGLER_OUTPUT_FILE_PATH`, entrada `deploy`). Credencial ou configuração inválidas → permanente; o resto → transitória.
- `DEPLOY_TARGET=local`: `PUT {EDGE_LOCAL_URL}/sites/{site}/versions` com o `tar.gz` (`application/gzip`), resposta `{ id }`. 4xx → permanente; 5xx, 429 e rede → transitória. É o contrato que o `edge-local` vai implementar.
- Guarda o `tar.gz` no bucket `build-cache` (`<site>/<versionId>.tar.gz`, S3 com `forcePathStyle`).
- Escreve `publish.json` sempre.
