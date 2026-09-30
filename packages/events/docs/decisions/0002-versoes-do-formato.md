# 0002 – Uma pasta e um subcaminho por versão do formato

- Status: aceito
- Data: 2026-09-29

## Contexto

Durante a promoção de uma release, o canário grava na versão nova do formato e os demais
sites na anterior, no mesmo dataset do Analytics Engine. O agregador precisa ler as duas.

## Decisão

- Mesmo padrão do `content-model`: `src/v<n>/` com subcaminho `@orakel/events/v<n>`.
- O `.` expõe só `SUPPORTED_FORMAT_VERSIONS`, `isSupportedFormatVersion`, `Result` e `Issue`.
- Todo ponto grava a versão em `blob1`; o agregador importa as versões suportadas e
  escolhe pelo `blob1`.
- Dentro de uma versão, só mudanças aditivas: campo opcional no payload, posição nova
  no fim do layout. Reordenar ou reaproveitar uma posição é versão nova.

## Alternativas consideradas

- Uma versão só no código, com o campo de versão para o futuro: exigiria reorganizar o
  pacote na primeira mudança incompatível, no meio de uma promoção.
- Namespaces no `.`: import menos explícito (descartado também no `content-model`).

## Consequências

Uma versão sai do código (pasta, subcaminho e número) quando nenhuma release em uso
grava nela e os pontos antigos já passaram da retenção de 3 meses do Analytics Engine.
