# @orakel/build-site

Entrypoints da imagem `site-builder` (a release do core): `render`, `publish` e `ssr`.

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

Render e publish pelas redes do compose local, como o `build-runner` fará (da raiz):
`pnpm local:publish <site>` → `https://<site>.localhost`.

Contrato do volume `/build` (lido pelo backoffice): `@orakel/build-site/contract`.
Comandos: `pnpm test` · `pnpm lint` · `pnpm typecheck` · `pnpm measure`. Documentação:
`docs/README.md`.
