# @orakel/events

Contrato dos eventos da plataforma Orakel AI: payload, manifesto, layout posicional do
Workers Analytics Engine, regras de sessão e o script do navegador, por versão do formato.
O Worker de borda grava; o agregador do backoffice lê.

## Uso

```ts
// Worker de borda
import { parseEventBody, pageviewDataPoint, canIssueSession } from '@orakel/events/v1';

const event = parseEventBody(await request.text()); // Result<EventPayload>
env.EVENTS.writeDataPoint(pageviewDataPoint({ site: env.SITE_ID, path, device, country }));

// Páginas do site (741 B com gzip)
import { startPageviewTracking } from '@orakel/events/v1/client';
startPageviewTracking({ articleId: 42 });
```

## Comandos (nesta pasta)

| Comando          | O que faz                                      |
| ---------------- | ---------------------------------------------- |
| `pnpm test`      | Vitest com cobertura (meta de 90%)             |
| `pnpm lint`      | ESLint (preset `domain`, sem Zod no `client/`) |
| `pnpm typecheck` | `tsc` do pacote e do `client/` (DOM)           |

Em container limpo, da raiz: `docker buildx bake events-test`.

## Documentação

`docs/README.md` (desta pasta) e, para o sistema, `docs/` da raiz.
