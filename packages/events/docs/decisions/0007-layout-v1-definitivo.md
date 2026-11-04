# 0007 – Layout posicional v1 definitivo

- Status: aceito
- Data: 2026-11-03

## Contexto

A entrada (ADR 0001) trouxe o layout posicional v1 do Analytics Engine como proposta, a
fixar no `packages/events`. A consolidação da audiência monta o SQL a partir dessas
posições, então elas precisam parar de mudar antes que o agregador dependa delas.

## Decisão

O layout v1 atual, com o `blob9` do ADR 0005, é definitivo:

| Coluna    | Campo (`BLOB_FIELDS`) | Conteúdo                   |
| --------- | --------------------- | -------------------------- |
| `index1`  | —                     | site (`SITE_ID` do Worker) |
| `blob1`   | `formatVersion`       | versão do formato          |
| `blob2`   | `type`                | `pageview` ou `discard`    |
| `blob3`   | `path`                | caminho                    |
| `blob4`   | `articleId`           | ID do artigo               |
| `blob5`   | `country`             | país                       |
| `blob6`   | `device`              | classe do dispositivo      |
| `blob7`   | `referrerHost`        | host do referrer           |
| `blob8`   | `sid`                 | ID da sessão               |
| `blob9`   | `discardReason`       | motivo do descarte         |
| `double1` | —                     | contagem (sempre `1`)      |

- A fonte é `BLOB_FIELDS` em `src/v1/layout.ts`: o índice + 1 é a posição. Nada foi
  reordenado, renomeado nem acrescentado ao fixar.
- O agregador monta o SQL só com `COLUMNS`; nenhum outro código escreve `blobN`.
- Daqui em diante valem as regras do ADR 0002: posição nova só no fim de `BLOB_FIELDS`;
  reordenar, renomear ou reaproveitar uma posição é versão nova do formato.

## Alternativas consideradas

- Manter como proposta até a produção ligar: o agregador nasceria sobre posições que
  ainda podiam mudar dentro da v1, sem versão nova para distinguir os pontos.
- Reorganizar as posições antes de fixar (por exemplo, `discardReason` junto de `type`):
  nenhum ganho para o SQL, que lê por nome via `COLUMNS`, e quebraria pontos já gravados
  no ambiente local.

## Consequências

O teste de `layout.test.ts` que confere cada posição passa a guardar um contrato fixo.
O limite de 2 kB do corpo e o caminho do manifesto continuam como proposta.
