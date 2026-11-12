# 0021 – Checklist da revisão só com confirmações humanas

- Status: aceito
- Data: 2026-11-12

## Contexto

O checklist da aprovação (`REVIEW_CHECKLIST`, #73) tinha cinco itens. Quatro vinham da RN-CON-02:
valor original, políticas de anúncios e afiliados, descrição das imagens e visualização
conferida. O quinto vinha da P14: imagens decorativas marcadas. Dois deles o sistema já
garante. O schema do bloco de imagem (`ImageBlockSchema`, em `@orakel/content-model`) exige
texto alternativo ou a marca de decorativa, nunca os dois. A aprovação passa pela validação da
release (`validateContentData`), que aplica esse schema e recusa a versão que não o cumpre.
Pedir ao revisor que confirme o que o sistema já barra só acrescenta cliques. A Story
Orakel-AI-Content/workspace#87 deixa no checklist manual só o que depende de julgamento.

## Decisão

- **`REVIEW_CHECKLIST` fica com três itens**: `valor_original`,
  `politicas_anuncios_afiliados` e `visualizacao_conferida`. Saem `descricao_imagens` e
  `imagens_decorativas_marcadas`.
- **RN-CON-02 e P14 mudam na forma, não no conteúdo.** A exigência de descrição nas imagens de
  conteúdo e de marca nas decorativas continua valendo para aprovar. Quem a garante agora é o
  schema, conferido pela validação da release, e não a marca do revisor.
- **As chaves que saíram são recusadas** com `review.checklist_incomplete`, pela regra que já
  recusava chave desconhecida. Um cliente que ainda as envie descobre que o checklist mudou.
- **Sem migração de `reviews.checklist`.** As linhas antigas continuam com as cinco chaves, que
  registram o que o revisor confirmou na época. A coluna é `jsonb` `string[]` sem validação na
  leitura, e nada lê as chaves de volta para comparar com o checklist atual.

## Alternativas consideradas

- Manter os cinco itens: o revisor confirmaria algo que não tem como estar errado numa versão
  aprovável.
- Aceitar e ignorar as chaves antigas: um cliente desatualizado aprovaria sem perceber que o
  checklist mudou.
- Migrar as revisões antigas para as três chaves: reescreveria o histórico do que foi
  confirmado, sem ganho para a leitura.

## Consequências

- Quem ler `reviews.checklist` pode encontrar chaves que não estão mais em `REVIEW_CHECKLIST`.
- Uma checagem nova que vire garantia do sistema pode sair do checklist do mesmo jeito.
- Se o schema do bloco de imagem deixar de exigir texto alternativo ou a marca de decorativa,
  o item tem que voltar ao checklist.
