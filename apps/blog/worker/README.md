# @orakel/blog-worker

Worker de borda dos sites da plataforma Orakel AI. Cada site é um Worker com Static
Assets; este código roda só em `/_e/*`: recebe o pageview, valida (bot, origem, tamanho,
schema, manifesto), emite a sessão quando a região permite e grava no Workers Analytics
Engine. Formato dos eventos em `@orakel/events`.

## Comandos (nesta pasta)

| Comando          | O que faz                                                |
| ---------------- | -------------------------------------------------------- |
| `pnpm dev`       | `wrangler dev` com `dev-assets/` (http://127.0.0.1:8787) |
| `pnpm types`     | Regenera `worker-configuration.d.ts` do `wrangler.jsonc` |
| `pnpm test`      | Vitest em Node                                           |
| `pnpm lint`      | ESLint (preset `app`)                                    |
| `pnpm typecheck` | `tsc --noEmit`                                           |

O deploy não é feito daqui: a etapa `publish` do build publica o Worker junto com cada
site, com um `wrangler.jsonc` gerado a partir do `wrangler.jsonc` desta pasta. No ambiente
local, `pnpm local:publish <site>` (na raiz) o publica no `edge-local`, onde o binding `EVENTS`
vai para o `ae-sim` (ClickHouse), e `pnpm local:load` gera pageviews com países variados.

## Documentação

`docs/README.md` (desta pasta) e, para o sistema, `docs/` da raiz.
