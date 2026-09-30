# 0001 – Entrada do scaffold do content-client

- Status: aceito
- Data: 2026-09-29

## Contexto

Gerado pela skill `/scaffold` (modo `unit`) a partir de `docs/platform-requirements/12.0-fase-0-ambiente-local.md` (`Orakel-AI-Content/workspace`, hash no spec).

## Decisão

**Linha `packages/content-client` do bloco do monorepo (11.1):**

> Cliente da API de exportação do Backoffice: loader do Content Layer do Astro para o build (lê NDJSON em streaming e valida cada linha) e leitura ao vivo para a visualização

**Etapa L1 (trechos usados):** as rotas da API de exportação v1 (`GET /api/export/v1/sites/{site}/snapshot` com o token do build; `…/config`, `…/routes/{caminho}` e `…/listing/{tipo}` com o token da visualização), o formato do snapshot (`header`, entidades, `end` com as contagens, usado para detectar corte) e: "`packages/content-client`: loader do Content Layer para o build, que lê o NDJSON em streaming e valida cada linha com o schema da sua versão; leitura ao vivo para a visualização. O parse ignora campos desconhecidos".

## Consequências

A leitura ao vivo ficou para depois (ADR 0002). A versão do Astro (7.3.5) fecha a pendência "Astro 5 ou 6" da fase 0.
