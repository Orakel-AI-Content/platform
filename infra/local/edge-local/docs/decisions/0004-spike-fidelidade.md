# 0004 – Spike de fidelidade do runtime local (L0)

- Status: aceito
- Data: 2026-09-30

## Resultado

Verificado com o Worker real do blog e assets, no runtime do wrangler 4.143, atrás do proxy (`src/fidelity.test.ts`, roda em todo `pnpm test`):

| Pergunta                             | Local                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `_headers`                           | ✓ `noindex` em tudo; `immutable` só nos caminhos com hash; padrão `public, max-age=0, must-revalidate` |
| `_redirects`                         | ✓ 301                                                                                                  |
| `html_handling: auto-trailing-slash` | ✓ 307 para a barra final (como na Cloudflare)                                                          |
| `not_found_handling: 404-page`       | ✓ `404.html` com status 404                                                                            |
| `run_worker_first: ["/_e/*"]`        | ✓ o pageview chega ao Worker                                                                           |
| Uma 404 aciona o Worker?             | Não observável localmente: validar no piloto (métricas de invocação)                                   |
| Troca de versão sem queda            | ✓ com a API do wrangler (duas instâncias em paralelo durante a troca); não precisa do `workerd` direto |

## Divergências e achados

- **`writeDataPoint` por service binding** (pergunta do spike AE × ClickHouse): chamado sem esperar, o RPC é descartado quando a resposta termina. O Worker do blog passou a usar `ctx.waitUntil(Promise.resolve(env.EVENTS.writeDataPoint(point)))` — inofensivo no Analytics Engine, onde a chamada é síncrona.
- **Binding para serviço inexistente** trava a partida do Worker local (o supervisor desiste em 30 s).
- **`request.cf.country`** não existe localmente: o alvo local aceita `X-Test-Country` (`ALLOW_COUNTRY_OVERRIDE`).
