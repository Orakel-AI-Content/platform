# Testes do events

Complementa `docs/conventions/testing.md` da raiz só com o que é deste pacote.

| Alvo      | Como                                                                                          | Arquivo                     |
| --------- | --------------------------------------------------------------------------------------------- | --------------------------- |
| Payload   | Aceita o válido; descarta campos que o navegador não deve mandar; `size`, `json` e `schema.*` | `v1/payload.test.ts`        |
| Manifesto | Build ordenado e idempotente; parse e índice                                                  | `v1/manifest.test.ts`       |
| Layout    | Posição por posição, para pageview e descarte; referrer só como host                          | `v1/layout.test.ts`         |
| Sessão    | Regiões sem sessão e país desconhecido                                                        | `v1/session.test.ts`        |
| Tracker   | Dublês de `storage`, `send`, `now` e `uuid`: renovação após 30 min, falhas silenciosas        | `v1/client/tracker.test.ts` |
| Navegador | `vi.stubGlobal` de `window`, `document` e `fetch`: endpoint e `pageshow`                      | `v1/client/index.test.ts`   |

- O teste do tracker valida o corpo enviado com `parseEventBody`: o script e o Worker
  sempre concordam.
- Meta: 90% de linhas e branches (`withCoverageThreshold(90)`).
- Peso do script (fora do CI, na mão):
  `pnpm dlx esbuild src/v1/client/index.ts --bundle --minify --format=esm | gzip -c | wc -c`
  — deve ficar abaixo de 2 kB.

## Como rodar

- Nesta pasta: `pnpm test` · um arquivo: `pnpm vitest run src/v1/layout.test.ts`
- Da raiz: `pnpm turbo run test --filter=@orakel/events`
- Em container limpo (da raiz): `docker buildx bake events-test`
