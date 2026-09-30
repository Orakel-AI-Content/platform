# 0003 – O manifesto de eventos fica no events

- Status: aceito
- Data: 2026-09-29

## Contexto

O Worker confere o artigo de cada pageview num manifesto gerado no build e lido pelo
binding de assets. Na fase 3, o manifesto também traz os blocos de afiliado. Quem gera é
o build do site; quem lê é o Worker. Nenhuma fonte dizia onde fica o schema.

## Decisão

- `@orakel/events/v1` exporta `EventManifestSchema`
  (`{ formatVersion, articles: [{ id, path }] }`), `buildEventManifest` para o build
  (ordenado por ID, para a saída ser idempotente), `parseEventManifest` e
  `indexManifest` para o Worker.
- O arquivo fica em `EVENT_MANIFEST_PATH = '/_data/events-manifest.json'` (_proposta_),
  fora de `/_e/*`, para não disparar o Worker.

## Alternativas consideradas

- No `content-model`: misturaria o contrato de conteúdo com o de eventos.
- No blog ou no `build-site`: o Worker é outro app e não pode importar dali.

## Consequências

O manifesto é público nos assets, como o próprio site: traz só o que já está publicado.
