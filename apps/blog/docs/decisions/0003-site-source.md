# 0003 – As páginas recebem o site por uma fonte trocável

- Status: aceito
- Data: 2026-09-30

## Decisão

- As páginas recebem um `PageContext` (`site`, `path`, `base`, `preview`) e não sabem de onde vêm os dados.
- **Build:** `src/data/collections.ts` monta o snapshot das coleções do `snapshotLoaders` (uma leitura, com `metaFile`).
- **Visualização:** o middleware lê `/<site>/<caminho>`, carrega o site pelo snapshot de visualização (`readSnapshot` com `kind: 'preview'`, `src/data/preview.ts`, cache de 10 s, falha fora do cache) e responde com `X-Robots-Tag: noindex`; links ganham o prefixo `/<site>`.
- **Modo fixture:** `fixtureFetch` serve a fixture do content-model nas rotas do snapshot (build e visualização), em streaming: a validação é a mesma da API.

## Consequências

A visualização mostra a versão mais recente de cada conteúdo, rascunhos inclusive, pelo snapshot de visualização do backoffice (ADR 0009 do backoffice), com o token próprio; as páginas não mudaram.
