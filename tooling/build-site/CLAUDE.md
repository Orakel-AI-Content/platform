# build-site

Entrypoints da imagem `site-builder` (`docker/site-builder/Dockerfile`): `render` (astro build do
blog → `/build`, trava de segurança, `wrangler.jsonc` por alvo, `result.json`), `publish`
(`cloudflare` ou `edge-local`, `build-cache`, `publish.json`) e `ssr`. Parte do monorepo —
regras gerais no `CLAUDE.md` da raiz.

## Comandos (rodar nesta pasta)

- Testar: `pnpm test` · lint / tipos: `pnpm lint` · `pnpm typecheck`
- Imagem e fumaça (da raiz): `docker buildx bake site-builder --load && tooling/build-site/scripts/smoke.sh`
- Medições: `pnpm measure` (manual)

## Regras invioláveis

- `result.json`/`publish.json` sempre escritos, validados pelo `contract.ts`; código de saída concorda (0/10/20).
- Erro sem `kind` é transitório; configuração e conteúdo inválidos são permanentes.
- Token do build só no render, token de deploy só no publish; nunca em log, erro ou volume.
- Mudou o contrato? Aditivo, com o backoffice no mesmo PR; quebra = `formatVersion` novo.
- O blog não é dependência declarada deste pacote (Turbo `^build`); a imagem o inclui pelo `turbo prune`.

## Documentação (leia sob demanda)

IMPORTANT: antes de começar uma tarefa, identifique quais documentos abaixo são
relevantes e leia-os primeiro.

- `docs/architecture/overview.md` – sequência e contrato
- `docs/decisions/0002-contrato-do-volume.md` – arquivos e códigos
- `docs/decisions/0006-imagem.md` – por que a imagem é assim
- `docs/conventions/testing.md` – testes, fumaça, medições
- `docs/project-spec.yaml` – decisões desta unidade (herda as da raiz)
