# 0005 – Publish: dois alvos, build-cache, contrato com o edge-local

- Status: aceito
- Data: 2026-09-30

- Só publica se `result.json` diz `ok` para o mesmo site; senão, falha permanente.
- Compacta `site/` + o `wrangler.jsonc` do alvo (`tar.gz`).
- `DEPLOY_TARGET=cloudflare`: `wrangler deploy --config`; a versão vem do arquivo de saída do wrangler (`WRANGLER_OUTPUT_FILE_PATH`, entrada `deploy`). Credencial ou configuração inválidas → permanente; o resto → transitória.
- `DEPLOY_TARGET=local`: `PUT {EDGE_LOCAL_URL}/sites/{site}/versions` com o `tar.gz` (`application/gzip`), resposta `{ id }`. 4xx → permanente; 5xx, 429 e rede → transitória. É o contrato que o `edge-local` vai implementar.
- Guarda o `tar.gz` no bucket `build-cache` (`<site>/<versionId>.tar.gz`, S3 com `forcePathStyle`).
- Escreve `publish.json` sempre.
