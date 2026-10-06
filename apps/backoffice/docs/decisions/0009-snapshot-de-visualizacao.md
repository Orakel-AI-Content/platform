# 0009 – Snapshot de visualização no lugar das rotas por caminho

- Status: aceito (substitui as rotas `config`, `routes` e `listing` do backlog do 0002)
- Data: 2026-10-05

## Contexto

A visualização SSR do blog (12.0, L2) precisa mostrar rascunhos, conteúdo em revisão e a
configuração corrente antes do build (Story workspace#15). A API de exportação só tinha o
snapshot do build, com as versões publicadas. O 12.0 (L1) propunha, para a visualização,
`GET …/sites/{site}/config`, `…/routes/{caminho}` e `…/listing/{tipo}`, e deixava em aberto
o nome e o formato definitivos das rotas da v1 (seção 10).

## Decisão

- **Rota:** `GET /api/export/v1/sites/{site}/preview-snapshot`, irmã do `snapshot`, só na
  rede interna (o prefixo `/api/export` já é bloqueado no hostname público) e só com o
  `EXPORT_PREVIEW_TOKEN`. O snapshot do build continua aceitando só o `EXPORT_BUILD_TOKEN`.
- **Formato:** o mesmo NDJSON do build (`SnapshotLine` do `content-model/v1`, header com as
  mudanças pendentes inclusive). Muda só a seleção de versões (`VersionSelection` em
  `snapshotLines` e `openSnapshot`): `latest` traz a versão mais recente de cada conteúdo
  em qualquer estado, e deixa de fora o conteúdo cuja última versão é `despublicado`. O
  filtro vale sobre a última versão; aplicado antes, traria de volta a versão anterior à
  despublicação.
- **Configuração:** a corrente, a mesma do build. Não existe rascunho de configuração; uma
  alteração aparece na visualização antes de chegar ao site público, até o próximo build.
- **Leitura:** a mesma transação `REPEATABLE READ` só de leitura do snapshot do build.

## Alternativas consideradas

- Rotas por caminho do 12.0 (`config`, `routes/{caminho}`, `listing/{tipo}`): o backoffice
  resolveria caminhos e listagens, duplicando o roteamento do `packages/core`, e a
  visualização teria um modelo de dados diferente do build, sem paridade estático × SSR.
- `…/snapshot/preview`: aninhada, parece um recurso do snapshot do build.
- `…/snapshot?mode=preview`: uma rota só para dois consumidores com tokens diferentes.
- Função separada para a visualização: duplicaria a ordem do contrato e as contagens do `end`.

## Consequências

- O blog só troca a fonte da visualização (Task platform#22); `resolvePath`, listagens e
  páginas continuam iguais.
- A visualização relê o site inteiro a cada leitura (hoje com cache de 10 s no blog); cache
  ou leitura incremental fica para quando o volume pedir.
- A seção 10 do 12.0 deve registrar este formato (Story workspace#29).
