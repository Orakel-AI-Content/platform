# 0001 – Entrada do scaffold do edge-local

- Status: aceito
- Data: 2026-09-30

## Contexto

Gerado pela skill `/scaffold` (modo `unit`) a partir da `12.0` (`Orakel-AI-Content/workspace`, hash no spec).

## Decisão

**L3, `edge-local`:** "API de administração (só rede `publish`): `PUT /sites/{site}/versions` (recebe o artefato, devolve o ID), `POST /sites/{site}/rollback` (volta a uma versão), `GET /sites/{site}/versions`; guarda cada versão num diretório imutável e mantém um Worker local por site, que passa a servir a nova versão depois da troca".

**11.6:** Deploy na Cloudflare → `edge-local`; Analytics Engine → Worker `ae-sim` gravando no ClickHouse; redes `publish` e `edge`; `<site>.localhost` público.

**L0, spike:** "Fidelidade do `wrangler dev` […] Trocar de versão sem downtime perceptível é viável com `wrangler dev` ou é preciso o `workerd` direto? → Desenho do `edge-local`".

## Recortes

`ae-sim` mínimo (NDJSON) em vez do ClickHouse (ADR 0006); redes com o `build-runner`.
