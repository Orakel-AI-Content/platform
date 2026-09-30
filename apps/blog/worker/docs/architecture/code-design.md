# Design de código do Worker de borda

Consulte ao escrever ou revisar código em `src/`. Convenções gerais: `docs/conventions/coding.md` da raiz.

| Módulo              | Responsabilidade                                                      | Toca o runtime? |
| ------------------- | --------------------------------------------------------------------- | --------------- |
| `index.ts`          | Lê `env` e `request`, cria o cache do manifesto, traduz em `Response` | Sim             |
| `pageview.ts`       | Fluxo: bot → origem → tamanho → corpo → manifesto → sessão → ponto    | Não             |
| `bot.ts`            | `isBot` (`isbot`; sem user-agent = bot)                               | Não             |
| `origin.ts`         | `Sec-Fetch-Site` decide; sem ele, `Origin` igual à da requisição      | Não             |
| `country.ts`        | `cf.country`, ou `X-Test-Country` com `ALLOW_COUNTRY_OVERRIDE`        | Não             |
| `device.ts`         | `mobile`, `tablet` ou `desktop` pelo user-agent                       | Não             |
| `manifest-cache.ts` | Manifesto uma vez por isolate; falha libera nova tentativa            | Não             |

## Padrões

- O fluxo recebe tudo por parâmetro (`PageviewRequest`, `PageviewDeps`) e devolve
  `Outcome`; só o `index.ts` conhece `Request`, `env` e `Response`.
- Formato, layout, sessão e manifesto vêm de `@orakel/events/v1`; nenhum `blobN` aqui.
- Descarte: `discard(motivo)` grava o ponto e escolhe o status; nada de corpo.
- Logs: `console.error(JSON.stringify({ msg, … }))`, sem dado de visitante.

## Anti-padrões

- Ler o corpo antes de conferir bot e origem.
- Confiar em site, país ou horário vindos do payload.
- `await` no `writeDataPoint` ou qualquer chamada a servidor externo.
