# 0005 – Contratos entre unidades e versionamento

- Status: aceito
- Data: 2026-09-29

## Contexto

Backoffice (quem envia) e build (quem consome) são publicados em ritmos diferentes, e
os eventos atravessam Worker, Analytics Engine, fila e agregador.

## Decisão

- **Conteúdo e configuração de site:** schemas Zod em `@orakel/content-model`, com
  `schemaVersion = 1` e a lista de recursos suportados. Evolução só aditiva dentro de
  uma versão; mudança incompatível cria a próxima; o parse ignora campos desconhecidos;
  validação semântica além do schema.
- **API de exportação:** NDJSON em streaming, uma entidade por linha, validada linha a
  linha pelo loader de `@orakel/content-client`.
- **Eventos:** formato versionado em `@orakel/events` (payload, layout posicional do
  Analytics Engine, mensagem de fila). Eventos anônimos: sem cookie, sem identificador
  persistente, sem IP armazenado.
- **Teste de contrato no CI** (`test:contract`): a exportação do backoffice precisa
  produzir linhas que passam no schema. As mesmas fixtures NDJSON versionadas alimentam
  o build dos dois sites de exemplo.
- **Release do core:** tag manual `core-vX.Y.Z`. Major muda o schema da API ou exige
  migração de configuração; minor, funcionalidades; patch, correções. Merge na `main`
  não cria release.

## Alternativas consideradas

- Subir o Backoffice real no CI para cada build de exemplo — mais fiel, mais minutos
  e PRs mais lentos. Fica para o `e2e.yml` manual.

## Consequências

- Mudar um schema exige rodar os testes de `content-model`, `content-client`,
  `backoffice` e `blog`.
