# Documentação

Índice da documentação do monorepo `platform`. Cada unidade (`apps/*`, `packages/*`,
`adapters/*`, `tooling/build-site`) tem o próprio `docs/`, que aponta para estes em vez
de repeti-los.

| Documento                  | Quando consultar                                                               |
| -------------------------- | ------------------------------------------------------------------------------ |
| `project-spec.yaml`        | Todas as decisões do repositório, com origem, e as unidades previstas          |
| `architecture/overview.md` | Visão do sistema, planos, contratos, mapa das unidades, como criar uma unidade |
| `domain/glossary.md`       | Termos do domínio (site, bloco, preset, variante…)                             |
| `design/accessibility.md`  | Meta WCAG 2.2 AA e como é verificada                                           |
| `conventions/coding.md`    | Fronteiras, erros, logs, configuração, dependências                            |
| `conventions/testing.md`   | Vitest, Playwright, cobertura, fixtures                                        |
| `conventions/git.md`       | Branches, commits, PRs, releases do core                                       |
| `guides/local-setup.md`    | Pré-requisitos, instalação, ambiente local em containers                       |
| `guides/claude-code.md`    | Como o repositório está organizado para o Claude Code                          |
| `decisions/`               | ADRs: por que cada escolha foi feita (0010–0015: ambiente local)               |
