# 0009 – O agregador é um job do backoffice-worker

- Status: aceito (substitui a parte do agregador do 0004)
- Data: 2026-09-29

## Contexto

O ADR 0004 definiu o agregador como quarto entrypoint do backoffice (`aggregator`), com
serviço próprio no compose. A entrada do scaffold do backoffice (bloco da fase 0, linha
"Processos") e a etapa L6 o descrevem como job horário do `backoffice-worker`.

## Decisão

- O agregador é uma **task do Graphile Worker** no `backoffice-worker`, disparada pelo cron
  embutido (horária), com o heartbeat dos jobs críticos.
- A imagem do backoffice atende **três** comandos: `web`, `worker` e `build-runner`.

## Alternativas consideradas

- Manter o entrypoint `aggregator` (0004): isola a agregação e permite reiniciá-la sozinha,
  ao custo de mais um serviço para operar. Volta a fazer sentido pelo gatilho da raiz
  ("painel lento" ou cliques brutos acima de ~10 milhões de linhas).

## Consequências

- Retentativa, registro no Postgres e backup vêm do Graphile Worker, como os demais jobs.
- `CLAUDE.md`, `docs/architecture/overview.md`, `docs/project-spec.yaml` e o glossário
  passam a falar em três comandos.
