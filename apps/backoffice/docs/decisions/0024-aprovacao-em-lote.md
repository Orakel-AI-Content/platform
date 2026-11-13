# 0024 – Aprovar e publicar em lote

- Status: aceito
- Data: 2026-11-13

## Contexto

A ADR 0021 deixou no checklist da aprovação (`REVIEW_CHECKLIST`) só as confirmações que
dependem de julgamento humano: valor original, políticas de anúncios e afiliados e
visualização conferida. Elas são gravadas por versão quando o revisor marca cada uma, e
`approveVersion` exige as três. A Story Orakel-AI-Content/workspace#91 (critérios 5 a 7) pede
que o revisor aprove e publique de uma vez os artigos limpos da fila, confirmando a leitura
num resumo do lote, e veja o que aconteceu com cada um. Abrir artigo por artigo para marcar
três caixas anula o ganho do lote. Aprovar sem as confirmações quebraria a ADR 0021.

## Decisão

- **A confirmação de leitura no resumo do lote é a confirmação humana do checklist.**
  `approveAndPublishBatch` grava as três chaves de cada artigo (`setAllConfirmations`) em nome
  do revisor que confirmou o lote, antes de aprovar. Continua sendo uma pessoa com
  `content.publish` que confirma, e `reviews.checklist` registra o mesmo que a aprovação
  individual.
- **Só entra no lote o artigo limpo**, conferido no servidor, artigo por artigo, com a versão
  travada: a versão mais recente, `em_revisao`, sem pendência (a mesma contagem da fila,
  incluindo o link externo que não respondeu), com a checagem de links concluída e com parecer
  automático favorável. O inelegível é recusado com `review.batch_ineligible`, e a mensagem diz
  o motivo. Um link fora do ar, que na aprovação individual é só aviso, tira o artigo do lote.
- **Cada artigo roda no próprio savepoint**, e a recusa desfaz só ele: confirmações, revisão e
  publicação. O desfecho volta por artigo (`published`, `scheduled` com o instante e o
  transbordo, ou `failed` com as issues). Aqui não vale o tudo-ou-nada da despublicação em
  massa (`unpublishContents`).
- **O lote só aprova e publica**, por `approveAndPublish`, que agenda na próxima vaga quando o
  limite diário enche. Os artigos ocupam as vagas na ordem recebida.

## Alternativas consideradas

- Aprovar em lote sem as confirmações: exigiria afrouxar `approveVersion` e tornaria a
  aprovação do lote uma decisão sem confirmação humana registrada.
- Aprovação automática pelo parecer favorável: tira a pessoa da decisão, contra a ADR 0021.
- Tudo-ou-nada, como a despublicação em massa: um artigo que perdeu a vez no meio do lote
  barraria os outros, e o revisor não saberia o desfecho de cada um.
- Confiar na seleção da tela: a fila pode estar desatualizada quando o lote roda.

## Consequências

- As confirmações gravadas pelo lote não se distinguem das marcadas uma a uma: mesmo
  `confirmedBy`, mesmas chaves.
- O resumo do lote (platform#776) tem que deixar claro que a confirmação vale para os três
  itens do checklist de cada artigo.
- Um critério novo de elegibilidade entra em `ineligibility`, em `reviews.ts`, e na mensagem.
