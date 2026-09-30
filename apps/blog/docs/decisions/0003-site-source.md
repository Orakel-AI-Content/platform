# 0003 – As páginas recebem o site por uma fonte trocável

- Status: aceito
- Data: 2026-09-30

## Decisão

- As páginas recebem um `PageContext` (`site`, `path`, `base`, `preview`) e não sabem de onde vêm os dados.
- **Build:** `src/data/collections.ts` monta o snapshot das coleções do `snapshotLoaders` (uma leitura, com `metaFile`).
- **Visualização:** o middleware lê `/<site>/<caminho>`, carrega o site por `readSnapshot` (`src/data/preview.ts`, cache de 10 s, falha fora do cache) e responde com `X-Robots-Tag: noindex`; links ganham o prefixo `/<site>`.
- **Modo fixture:** `fixtureFetch` serve a fixture do content-model na rota do snapshot, em streaming: a validação é a mesma da API.

## Consequências

Hoje a visualização mostra o conteúdo publicado. Rascunhos entram trocando a fonte do SSR pela leitura ao vivo (rotas de visualização do backoffice e live loader do content-client), sem mexer nas páginas.
