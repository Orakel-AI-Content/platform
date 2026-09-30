# 0001 – Entrada do scaffold do blog

- Status: aceito
- Data: 2026-09-30

## Contexto

Gerado pela skill `/scaffold` (modo `unit`) a partir do bloco de scaffold do `apps/blog` na `12.0` (`Orakel-AI-Content/workspace`), colado no comando, com a P4 e a P14 (`10`) e a medição (`07`). Hashes no spec. O scaffold foi pausado para gerar antes content-model, content-client, tokens e core, e retomado com eles prontos.

## Decisão

Tópicos definidos pela entrada: app Astro genérico por `SITE_ID`, sem código por site; estático em produção e SSR (adapter Node) só para a visualização, por `/<site>/<caminho>`, com `noindex`; configuração do site como dado; lógica de domínio nos pacotes; rotas, arquivos gerados, estilização, temas e composição em quatro níveis, escada de interatividade, Pagefind, imagens e fontes, medição, orçamento de JS, idempotência, WCAG 2.2 AA, axe, paridade e deploy pela imagem `site-builder`.

## Divergências e recortes

- **Fixtures:** ficam no `content-model` (decisão dele), não em `apps/blog/fixtures/`.
- **Visualização:** mostra o conteúdo publicado até a leitura ao vivo existir (ADR 0003).
- **Interatividade:** só o degrau 1 agora; o degrau 2 vem com `packages/elements` (ADR 0009).
- **Orçamento da busca:** 130 kB, não 80 (ADR 0010).
- **Manifesto de eventos:** gerado com o `events` (`buildEventManifest`) e os caminhos do core.
- **Backlog:** página de teste da ilha React (`packages/ui`).
