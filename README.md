# platform

Monorepo da plataforma Orakel AI: uma rede de 5 a 20 sites de conteúdo gerados a partir
de uma única base de código, com Backoffice próprio, geração de conteúdo com LLM e
revisão humana.

- **Stack:** TypeScript 6 (estrito), Node 24, pnpm 11 + Turborepo, Postgres 18.
- **Sites:** Astro estático na Cloudflare, parametrizado por `SITE_ID`.
- **Backoffice:** Next.js na VPS (compose).
- **Estado:** fase 0 — raiz do monorepo pronta; unidades a gerar.

## Começar

```sh
corepack enable
pnpm install
cp .env.example .env.local
pnpm local:up
```

Detalhes em [`docs/guides/local-setup.md`](docs/guides/local-setup.md).

## Estrutura

| Pasta       | Conteúdo                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------ |
| `apps/`     | Apps: `blog` (+ `worker`), `backoffice`, `generator`                                                   |
| `packages/` | Domínio compartilhado: `content-model`, `content-client`, `core`, `tokens`, `elements`, `events`, `ui` |
| `adapters/` | Adaptadores de framework (`astro`)                                                                     |
| `tooling/`  | Configurações compartilhadas e `build-site`                                                            |
| `infra/`    | Compose (VPS e local); OpenTofu e Ansible no primeiro deploy                                           |
| `docker/`   | Alvos e tags das imagens                                                                               |
| `docs/`     | Arquitetura, convenções, guias e ADRs                                                                  |

## Documentação

Comece por [`docs/README.md`](docs/README.md) e
[`docs/architecture/overview.md`](docs/architecture/overview.md).

## Claude Code

O repositório já vem com `CLAUDE.md`, `.claude/rules/` e `.claude/settings.json`
(ver [`docs/guides/claude-code.md`](docs/guides/claude-code.md)). Preferências pessoais
vão em `CLAUDE.local.md` e `.claude/settings.local.json`, ambos fora do Git.
