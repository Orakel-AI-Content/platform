# edge-local

Substituto local do deploy na Cloudflare: supervisor Node que sobe um Worker por site com a API
do wrangler (`unstable_startWorker`), atrás de um proxy por Host, com versões imutáveis,
rollback e o `ae-sim` (Analytics Engine → NDJSON). Só no ambiente local. Parte do monorepo —
regras gerais no `CLAUDE.md` da raiz.

## Comandos (rodar nesta pasta)

- Testar: `pnpm test` (inclui o spike de fidelidade com o runtime real, ~2 s)
- Lint / tipos: `pnpm lint` · `pnpm typecheck`
- Rodar na máquina: `pnpm dev` · imagem (da raiz): `docker buildx bake edge-local --load`

## Regras invioláveis

- Troca sem queda: sobe a nova antes de desligar a antiga; uma operação por vez por site.
- Nunca escreva em `site/`, `worker/` ou `wrangler.jsonc` de uma versão; `active` só por `rename`.
- O Worker servido é o bundle do arquivo (o da release), nunca o código-fonte do repositório.
- Divergência do runtime local em relação à Cloudflare: registre no ADR 0004 e no `fidelity.test.ts`.

## Documentação (leia sob demanda)

IMPORTANT: antes de começar uma tarefa, identifique quais documentos abaixo são
relevantes e leia-os primeiro.

- `docs/architecture/overview.md` – fluxo e responsabilidades
- `docs/decisions/0003-versoes.md` – versões, API e retenção
- `docs/decisions/0004-spike-fidelidade.md` – o que o local reproduz e o que não
- `docs/conventions/testing.md` – como testar o proxy e o runtime
- `docs/project-spec.yaml` – decisões desta unidade (herda as da raiz)
