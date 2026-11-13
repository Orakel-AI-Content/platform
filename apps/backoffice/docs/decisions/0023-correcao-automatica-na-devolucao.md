# 0023 – Correção automática pedida na devolução

- Status: aceito
- Data: 2026-11-13

## Contexto

Ao devolver uma versão (ADR 0020), o revisor pode pedir que o modelo corrija o artigo a partir
do comentário dele (Orakel-AI-Content/workspace#95). O pedido precisa ficar registrado como uma
execução, com prompt, modelo, tokens, custo, duração e desfecho (R5). E precisa entrar na fila
junto com a devolução: uma devolução sem o pedido, ou um pedido sem a devolução, deixaria o
artigo num estado que ninguém escolheu.

A ADR 0019 fixou a R4 para a geração: uma chamada ao modelo, sem nova tentativa. A correção é
uma chamada nova, feita depois de um parecer humano, e por isso precisa de uma regra explícita.

## Decisão

- **Mesma tabela, com tipo**: `generation_runs` ganha `kind` (`geracao` | `correcao`, default
  `geracao` para as linhas que já existem), `base_version` (a versão devolvida, FK composta para
  `content_versions` com `content_id`) e `review_id` (a revisão `devolvido`). Dois CHECKs
  garantem as colunas de cada tipo. A `geracao` exige tema, autor e contexto editorial e não
  tem versão-base nem revisão. A `correcao` exige conteúdo, versão-base e revisão e não tem tema
  nem autor. Na correção, o contexto editorial é o vigente no pedido, ou nulo quando o site não
  tem um.
- **O pedido nasce em `returnVersion`**, com a opção `autoCorrect`, na mesma transação da
  devolução. Grava a execução `correcao` `pendente` e enfileira `correct-article`. Recusada a
  devolução, nada é gravado. Sem a opção, a devolução continua igual.
- **Exceção à R4, só para este caso**: uma tentativa automática por devolução, nunca uma
  retentativa. O job vai com `max_attempts => 1`, `job_key` `correct-article:<revisão>` e
  `job_key_mode => 'unsafe_dedupe'`. Um pedido repetido para a mesma revisão não cria outro
  job, nem com o primeiro já rodando: o modo `replace` criaria um segundo, e seria uma
  retentativa. Uma nova correção exige uma nova devolução, ou seja, outro parecer humano.
- **As leituras da geração filtram o tipo**: `pendingRun` e `listGenerationRuns` só leem
  `geracao`. As correções entram na tela de Geração depois (#805).
- **`finishRun` só grava o `contentId` no `ok`**: na falha fica o que havia, nulo na geração e
  o conteúdo corrigido na correção.

## Alternativas consideradas

- Tabela própria para as correções: duplicaria as colunas da chamada ao modelo, e a lista e o
  custo da tela de Geração teriam de juntar as duas tabelas.
- Uma função separada que a tela chama depois da devolução: são duas transações, e a devolução
  poderia ficar sem o pedido.
- `job_key_mode` padrão (`replace`): troca o job que ainda espera, mas cria outro quando o
  primeiro já está rodando.

## Consequências

- Quem lê `generation_runs` tem de filtrar pelo `kind`. `topic` e `author_id` são anuláveis no
  tipo do Drizzle, e só o CHECK garante esses campos na `geracao`.
- A task `correct-article` (#800) lê a execução pelo `runId` do payload e grava o desfecho com
  `finishRun`.
