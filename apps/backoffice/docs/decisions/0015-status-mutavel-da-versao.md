# 0015 – Status mutável da versão de conteúdo

- Status: aceito
- Data: 2026-10-07

## Contexto

A 0003 guarda cada versão de conteúdo em `content_versions` como imutável, com status e
dados. A revisão editorial (workspace#19) precisa mover uma versão de `rascunho` para
`em_revisao`, e depois para `aprovado`, sem mudar o que foi escrito. O refinamento decidiu
que o status muda na própria versão, com o histórico da revisão na tabela `reviews`.

## Decisão

- **Dados imutáveis, status mutável:** `data` e `created_at` de uma versão nunca mudam. A
  transição de revisão só atualiza a coluna `status` da versão mais recente. Salvar de
  novo cria a versão N+1 em `rascunho`.
- **Envio para revisão** (`submitForReview`): só a versão mais recente, e só se estiver em
  `rascunho`. Exige `content.write` e trava a linha de `contents`, como a edição.
- **Sem mudança pendente:** a transição de status não chama `recordPendingChange`. O
  snapshot não carrega o status (`toContent` usa só `data`), e a seleção `published` só
  muda quando uma versão chega a `publicado`, o que é papel da publicação. Registrar a
  mudança agendaria um build idêntico ao anterior.
- **Fila de revisão** (`listReviewQueue`): conteúdos cuja versão mais recente está
  `em_revisao`, da mais antiga para a mais recente. O filtro vem depois do `DISTINCT ON`.

## Alternativas consideradas

- Criar uma versão nova a cada transição: duplica os dados e faz o número da versão contar
  transições, em vez de edições.
- Status em `contents`: perde o vínculo com a versão revisada e aprovada.

## Consequências

- "Versão imutável" na 0003 passa a significar os dados da versão, não o status.
- A data da fila é a da versão, não a do envio. Guardar a data do envio exige uma coluna nova.
- A publicação, que leva a versão a `publicado`, registra a mudança pendente, porque muda
  o snapshot.
