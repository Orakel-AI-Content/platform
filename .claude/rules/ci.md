---
paths:
  - '.github/workflows/**'
---

# Workflows

- CI sem segredos: só `GITHUB_TOKEN`. Nenhum segredo de produção no GitHub.
- Repositório privado no plano Free (2.000 min/mês): mantenha filtros de caminho, `--affected`, `concurrency` e cache do Turbo.
- Jobs chamam tarefas do Turbo (`pnpm turbo run <tarefa> --affected`), nunca comandos de uma unidade específica.
- Node pelo `.nvmrc`, pnpm pelo `packageManager` (`pnpm/action-setup` sem versão).
- E2E completo só em `e2e.yml` (manual).
- `add-to-project.yml` é do workflow orakel; não altere.
  Detalhes: `docs/decisions/0008-operacao.md`
