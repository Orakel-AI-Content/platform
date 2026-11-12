# 0022 – Revisor corrige o conteúdo durante a revisão

- Status: aceito
- Data: 2026-11-12

## Contexto

A ADR 0001 separa os papéis: `editor` escreve conteúdo (`content.write`), `revisor` aprova e
publica (`content.publish`). Para corrigir um erro de digitação, uma categoria trocada ou a
data, o revisor hoje só pode devolver ao editor (ADR 0020), e o artigo volta para o fim da fila.
A Story Orakel-AI-Content/workspace#88 pede que o revisor corrija sem devolver. As confirmações
da revisão já ficam gravadas por versão (#749), e cada edição grava uma versão nova (ADR 0015).

## Decisão

- **Ação nova `content.amend`**, para `revisor` e `admin`. Ela permite `amendInReview`
  (`domain/content/contents.ts`), e só ela. O revisor continua sem `content.write`: não cria
  conteúdo nem edita fora de uma revisão. O gerador (papel `editor`) não corrige.
- **Só durante a revisão**: `amendInReview` recebe a versão que o revisor viu. Ela tem que ser
  a mais recente e estar `em_revisao`, a mesma guarda de aprovar e devolver
  (`lockVersionInReview`). Correção depois de uma aprovação ou sobre uma versão que outra
  gravação substituiu é recusada.
- **A correção é uma edição**: mesma validação e mesma identidade dos blocos de
  `updateContent`, que divide o núcleo com ela. Grava a versão N+1 já `em_revisao`, com quem
  corrigiu em `created_by` e a mudança pendente. Dados iguais não gravam nada.
- **A versão N vai a `substituido`**. Fica só como histórico, fora da fila e da contagem da
  revisão.
- **As confirmações passam para a N+1 conforme o que mudou.** `valor_original` e
  `politicas_anuncios_afiliados` julgam o texto e caem se título, descrição ou blocos mudaram.
  `visualizacao_conferida` cai com qualquer mudança. As que passam mantêm quem marcou e quando.
- **A checagem de links externos (#745)** é enfileirada de novo para a N+1.

## Alternativas consideradas

- Dar `content.write` ao revisor: ele poderia criar e editar qualquer conteúdo a qualquer
  momento, sem a separação de papéis da ADR 0001.
- Deixar a versão N `em_revisao`: o histórico mostraria duas versões em revisão.
- Levar a versão N a `rascunho`: sugeriria um rascunho esperando envio, e a lista e a devolução
  pendente (ADR 0020) olham `rascunho`.
- Derrubar todas as confirmações a cada correção: o revisor marcaria de novo o que a correção
  de uma data não muda.

## Consequências

- Uma versão aprovada pode ter sido escrita em parte pelo próprio revisor. A autoria por versão
  (`created_by`, #748) mostra quem.
- Quem ler `substituido` não pode supor que a versão já esteve publicada: agora o status também
  marca uma versão em revisão trocada pela correção.
- A tela de correção (#751) e o painel com as confirmações gravadas (#752) usam esta função.
