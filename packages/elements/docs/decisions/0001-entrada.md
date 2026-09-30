# 0001 – Entrada do scaffold do elements

- Status: aceito
- Data: 2026-09-30

## Contexto

Gerado pela skill `/scaffold` (modo `unit`) a partir da `12.0` (`Orakel-AI-Content/workspace`, hash no spec), da escada de interatividade (`01`, seção 4; ADR-004) e do ADR 0009 do blog.

## Decisão

**Linha `packages/elements` (11.1):** "Web Components (comportamento agnóstico de framework)".

**Bloco do blog, Interatividade:** "Escada, subindo um degrau só quando o anterior não resolve: (1) só CSS (`scroll-snap`, `<details>`); (2) script leve ou Web Component; (3) ilha React […] Carrossel com `scroll-snap` e botões por script, menu mobile, copiar link".

**`01`, degrau 2:** "Botões de avançar/voltar do carrossel, menu mobile, copiar link, compartilhar, interface de busca (UI do Pagefind)". A UI do Pagefind já é o degrau 2 da busca e fica fora.

## Consequências

Os quatro componentes entram com a integração no blog, no mesmo PR (ADR 0005).
