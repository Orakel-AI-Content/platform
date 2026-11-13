# @orakel/build-contract

Contrato do volume `/build` entre o `render` e o `publish` da imagem `site-builder` e quem lê
o resultado: o `build-runner` do backoffice e o `edge-local`. Só Zod — quem importa não leva as
dependências do site-builder (astro, wrangler, workerd).

```ts
import { BUILD_DIR, PATHS, ResultSchema, exitCodeOf } from '@orakel/build-contract';

const result = ResultSchema.parse(JSON.parse(text)); // /build/result.json
if (result.status === 'failed') pause(result.failure.message); // permanent | transient
```

| Arquivo (`/build`)                                           | Escrito por | Conteúdo                                                      |
| ------------------------------------------------------------ | ----------- | ------------------------------------------------------------- |
| `site/`, `wrangler.cloudflare.jsonc`, `wrangler.local.jsonc` | render      | Artefato e configuração dos dois alvos                        |
| `result.json`                                                | render      | `ok` (mudanças vistas, páginas, arquivos, redirects) ou falha |
| `publish.json`                                               | publish     | `ok` (versão publicada, `cacheKey`) ou falha                  |

O volume `/infra` da imagem `infra-runner` (ADR 0027 da raiz) segue o mesmo molde, com
`INFRA_DIR` e `INFRA_PATHS`:

| Arquivo (`/infra`) | Escrito por | Conteúdo                                                |
| ------------------ | ----------- | ------------------------------------------------------- |
| `site.tfplan`      | plan        | Plano salvo e cifrado, aplicado tal como foi gerado     |
| `infra-plan.json`  | plan        | `ok` (recursos que mudam, com a ação) ou falha          |
| `infra-apply.json` | apply       | `ok` (`nameServers`, `zoneId`, `crawlerHints`) ou falha |

Códigos de saída: `0` ok, `10` permanente, `20` transitória. Comandos (nesta pasta):
`pnpm test` · `pnpm lint` · `pnpm typecheck`. Decisões: `docs/decisions/` e o ADR 0002 do
`tooling/build-site`.
