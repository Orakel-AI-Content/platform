# Testes do build-site

| Comando                                                       | O quê                                                                                                                                                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm test`                                                   | Vitest: alvos do wrangler (com o `wrangler.jsonc` real do Worker), classificação, trava, contagem, contrato, env, render e publish com dependências falsas, edge-local contra servidor HTTP real |
| `docker buildx bake site-builder --load` + `scripts/smoke.sh` | Imagem real: render num volume, `wrangler deploy --dry-run`, ssr (também no CI)                                                                                                                  |
| `pnpm measure`                                                | Medições (manual; ver `docs/measurements.md`)                                                                                                                                                    |

- `scripts/snapshot-server.ts` serve as fixtures do content-model (ou qualquer NDJSON) na rota do snapshot, com o token `SMOKE_TOKEN`.
- Render local sem imagem: suba o `snapshot-server` e rode `node src/cli.ts render` com `BUILD_DIR=/tmp/…` (ver README).
