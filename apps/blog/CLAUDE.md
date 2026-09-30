# blog

App Astro 7 dos sites: um build estático por `SITE_ID` e a visualização SSR de todos os
sites (`/<site>/<caminho>`). Consome content-client, content-model, core, tokens e events.
O `worker/` é outra unidade. Parte do monorepo — regras gerais no `CLAUDE.md` da raiz.

## Comandos (rodar nesta pasta)

- Dev: `pnpm dev` (lê `../../.env.local`: `CONTENT_SOURCE`, `SITE_ID`) · visualização: `pnpm preview`
- Testar: `pnpm test` · sites de exemplo: `pnpm build:examples && pnpm test:a11y && pnpm test:parity`
- Lint / tipos: `pnpm lint` · `pnpm typecheck` (`astro check` + `tsc`)

## Regras invioláveis

- Nenhum `import.meta.env` ou `SITE_ID` decide tema, preset ou variante: tudo vem da configuração do site.
- Lógica de domínio (SEO, rotas, arquivos gerados, tema, eventos) fica nos pacotes; o app compõe.
- Link interno só por `sitePath(base, rotaDoCore)`; nunca caminho montado à mão.
- Sem React e sem JS de UI no app (degrau 2 é do `elements`); orçamento de JS por `data-page-type`.
- O token do build nunca vai para log, erro ou saída.

## Documentação (leia sob demanda)

IMPORTANT: antes de começar uma tarefa, identifique quais documentos abaixo são
relevantes e leia-os primeiro.

- `docs/architecture/overview.md` – build, visualização, pacotes
- `docs/architecture/folder-structure.md` – onde fica cada coisa; página, preset, bloco novos
- `docs/decisions/0005-fim-do-build.md` – arquivos gerados, Pagefind, orçamento
- `docs/conventions/testing.md` – sites de exemplo, axe, paridade
- `docs/project-spec.yaml` – decisões desta unidade (herda as da raiz)
