# Claude Code neste repositório

Consulte para entender como o contexto do Claude Code está organizado e onde
acrescentar regras, skills e agentes.

## Onde abrir

Principalmente **na raiz**, com worktrees para trabalho em paralelo (ADR 0003, M.8).
Para o E2E local de cada worktree, `pnpm local:isolated up <id>` sobe um Backoffice e um banco
só da sessão (`docs/guides/local-setup.md`, "Sessões em paralelo"), e `pnpm local:e2e:area <área>`
roda só o E2E da área tocada, numa das vagas da máquina; a sessão não roda a suíte inteira.
Cada unidade também terá `CLAUDE.md`, regras e `settings.json` próprios, para quando
a sessão for aberta direto nela.

## Mapa do contexto

| Camada              | Arquivo                                            | Carrega quando                           |
| ------------------- | -------------------------------------------------- | ---------------------------------------- |
| Mapa do repositório | `CLAUDE.md`                                        | Sempre                                   |
| Fronteiras          | `.claude/rules/architecture.md`                    | Sempre                                   |
| Regras por área     | `.claude/rules/{tooling,infra,ci,testing}.md`      | Ao ler arquivos das pastas nos `paths`   |
| Unidade             | `<unidade>/CLAUDE.md` e `<unidade>/.claude/rules/` | Ao trabalhar na unidade                  |
| Detalhe             | `docs/**`                                          | Sob demanda, citado no `CLAUDE.md`       |
| Garantias           | `.claude/settings.json`                            | Sempre (permissões e hook de formatação) |

## Garantias do `settings.json`

- Bloqueia leitura de `.env`, `.env.local` e `dist/`; `.env.example` continua legível.
- Bloqueia `pnpm local:reset`, `rm -rf` e `git push --force`.
- Hook `PostToolUse` formata com Prettier cada arquivo editado (`.claude/hooks/format.sh`).
- Worktrees recebem `.env.local` (`.worktreeinclude`) e reaproveitam `node_modules`.

## Skills e agentes

As skills do workflow orakel ficam em `.agents/skills/` (instaladas pelo `skills-lock.json`)
com links em `.claude/skills/`. Novas skills vão em `.claude/skills/`; agentes em
`.claude/agents/`.

| Nome                       | Tipo           | Para quê                         |
| -------------------------- | -------------- | -------------------------------- |
| `task`, `bug`, `tech-debt` | skill (orakel) | Criar issues neste repositório   |
| `spec`                     | skill (orakel) | Elaborar a spec de uma issue     |
| `execute`                  | skill (orakel) | Implementar uma issue e abrir PR |

## Manutenção

- Claude errou a mesma coisa duas vezes → regra (`CLAUDE.md` se global, `.claude/rules/`
  com `paths` se local).
- Procedimento de vários passos → skill.
- Precisa ser garantido → hook ou permissão no `settings.json`.
- `CLAUDE.md` passou de ~100 linhas → mova conteúdo para regras ou `docs/`.
- Mudou estrutura ou arquitetura → atualize o doc e crie um ADR.
