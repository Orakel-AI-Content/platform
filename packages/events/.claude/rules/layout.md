---
paths:
  - 'src/v*/layout.ts'
  - 'src/v*/layout.test.ts'
---

# Layout do Analytics Engine

- As posições vêm só da ordem de `BLOB_FIELDS`; posição nova vai no fim. Nunca reordene nem reaproveite uma posição dentro da versão.
- Máximo de 20 blobs, 20 doubles e 1 índice (`index1` = site, chave de amostragem).
- Dimensões (filtrar, agrupar) em blob; só medidas somáveis em double.
- Referrer vira host (`referrerHost`); descarte não leva caminho, referrer nem `sid`.
- O teste confere o ponto posição por posição: mudou a ordem, ele quebra.
  Detalhes: `docs/decisions/0002-versoes-do-formato.md`, `docs/decisions/0005-descartes-no-layout.md`
