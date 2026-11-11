# 0020 – Devolução ao editor na revisão

- Status: aceito
- Data: 2026-11-11

## Contexto

Até aqui, a revisão só podia aprovar (ADR 0015). Quando o revisor achava um problema, não tinha
como devolver a versão nem dizer o que corrigir, e o conteúdo ficava parado na fila (#598). A
devolução precisa tirar a versão da fila, deixar o comentário à vista de quem edita e ficar
registrada junto das revisões da versão.

## Decisão

- **Transição `em_revisao → rascunho`**, sem status novo. Exige `content.publish`, como aprovar,
  e passa pela mesma guarda: a versão tem que ser a mais recente e estar `em_revisao`, com a
  linha de `contents` travada. Como na 0015, a transição só muda o `status` e não chama
  `recordPendingChange`. Devolver não valida a release, porque não leva nada ao site.
- **Registro em `reviews`**: duas colunas aditivas, `decision` (`aprovado` | `devolvido`, default
  `aprovado` para as linhas que já existem) e `comment` (obrigatório na devolução, sem os espaços
  das pontas; nulo na aprovação). A devolução grava `checklist` vazio.
- **A aprovação de uma versão é a linha `aprovado`**: `listContentVersions` só faz o join com
  ela. A mesma versão pode ser devolvida, reenviada sem edição e aprovada. Ficam várias linhas
  por versão, mas no máximo uma aprovação.
- **Devolução pendente** (`pendingReturn`): é a revisão mais recente do conteúdo, se for uma
  devolução e se a versão devolvida e todas as que vieram depois continuarem em `rascunho`. O
  detalhe do conteúdo e o editor mostram o comentário enquanto o editor salva a correção. O
  aviso some no reenvio ou na aprovação.

## Alternativas consideradas

- Status `devolvido`: diferenciaria o rascunho comum na lista, mas exigiria mudar
  `submitForReview`, os rótulos e as cores e a matriz de transições da 0015. O comentário no
  detalhe e no editor já mostra a diferença para quem edita.
- Tabela própria para as devoluções: separaria o histórico de revisão da versão em duas tabelas,
  e cada leitura do histórico teria que juntar as duas.

## Consequências

- Quem lê `reviews` tem que filtrar pela `decision`, porque uma linha já não quer dizer
  aprovação.
- A lista de conteúdos e a fila não distinguem "devolvido" de "rascunho". Se for preciso, um
  filtro pode sair de `reviews`, sem mudar o status.
- O comentário é uma mensagem só, sem conversa nem âncora num bloco.
