# @orakel/build-site

Entrypoints da imagem `site-builder` (versionada por `site-builder-vX.Y.Z`, ADR 0018 da raiz): `render`, `publish`, `rollback` e `ssr`.

```sh
# Imagem e fumaça (da raiz)
docker buildx bake site-builder --load
tooling/build-site/scripts/smoke.sh

# Render local, sem imagem (nesta pasta)
node scripts/snapshot-server.ts 8080 fixtures &
SITE_ID=exemplo-a SITE_DOMAIN=exemplo-a.com.br EXPORT_API_URL=http://127.0.0.1:8080 \
  EXPORT_BUILD_TOKEN=smoke-build-token-0000000000000000 BUILD_DIR=/tmp/build \
  node src/cli.ts render     # 0 ok · 10 permanente · 20 transitória; ver /tmp/build/result.json
```

Rollback para uma versão já publicada (ADR 0009): `SITE_ID`, `VERSION_ID` (o `versionId` do
`publish.json`), `DEPLOY_TARGET` e o acesso ao alvo (`EDGE_LOCAL_URL` ou `CLOUDFLARE_*`) →
`node src/cli.ts rollback`, que escreve `/build/rollback.json`.

No compose local, quem roda render e publish é o `build-runner` do Backoffice; para pedir o
build de um site pelo terminal (da raiz): `pnpm local:publish <site>` → `https://<site>.localhost`.

Contrato do volume `/build` (lido pelo backoffice e pelo edge-local): `@orakel/build-contract`.
No ambiente local, o `build-runner` do backoffice roda o `render` e o `publish` sozinho a cada
mudança (ADR 0008 do backoffice).
Comandos: `pnpm test` · `pnpm lint` · `pnpm typecheck` · `pnpm measure`. Documentação:
`docs/README.md`.
