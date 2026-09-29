# 0002 – Uma pasta e um subcaminho por versão de schema

- Status: aceito
- Data: 2026-09-29

## Contexto

Mudança incompatível cria a versão seguinte do schema, e a API de exportação atende a
versão da release corrente e a da anterior (N-1, ADR 0005 da raiz). O backoffice roda
sempre da `main`, então precisa das duas versões ao mesmo tempo.

## Decisão

- Cada versão mora em `src/v<n>/`, com schemas, recursos suportados e validação
  semântica próprios, exposta no subcaminho `@orakel/content-model/v<n>`.
- O subcaminho `.` expõe só o que atravessa versões: `SUPPORTED_SCHEMA_VERSIONS`,
  `isSupportedSchemaVersion`, `Result` e `Issue`.
- Quem consome importa a versão explicitamente. Uma versão nova nasce copiando a
  anterior e reaproveita por import o que não mudou.
- Dentro de uma versão, só mudanças aditivas: campo opcional novo, valor novo em
  `RESOURCES`. Remoção ou mudança de tipo é versão nova.
- Presets, variantes e tipos de bloco são conferidos pela validação semântica contra um
  `Resources` recebido por parâmetro, para o backoffice validar contra a release do
  site e não contra a `main`.
- Uma versão é removida (pasta, subcaminho e número em `SUPPORTED_SCHEMA_VERSIONS`)
  quando nenhum site usa mais uma release que dependa dela.

## Alternativas consideradas

- Namespaces no `.` (`import { v1 } from '@orakel/content-model'`): import menos
  explícito, remoção de versão menos visível.
- Uma versão só no código, com as anteriores nas tags do git: o backoffice não
  atenderia N-1.

## Consequências

- `package.json` ganha um `exports` por versão.
- Para acrescentar um preset, uma variante ou um tipo de bloco, basta editar o
  `RESOURCES` da versão corrente (tipo de bloco novo também ganha schema em `blocks/`).
