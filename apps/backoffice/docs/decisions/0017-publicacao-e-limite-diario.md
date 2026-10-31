# 0017 – Publicação e limite diário por site

- Status: aceito (completa a 0015 e segue a precedência da 0010)
- Data: 2026-10-31

## Contexto

A 0015 deixa a versão chegar a `aprovado` sem mudança pendente e reserva para a publicação
a passagem a `publicado`, que muda a seleção `published` do snapshot. A Story de publicação
(workspace#20, R1 e R2) pede que cada site respeite um limite diário de publicações, de 3
por proposta, calibrado na fase 2. O refinamento decidiu que o dia é sempre o de
`America/Sao_Paulo`, não o `timeZone` do site, e que o limite é ajustável por site (#490).

## Decisão

- **Tabela `publications`:** uma linha por ação de publicar, com site, conteúdo, versão,
  e-mail de quem publicou, `published_at` e `scheduled_for` (nulo, para o agendamento da
  #488). É operacional: fica fora do snapshot e de `EXPORTED_TABLES`. O índice
  `(site_id, published_at)` atende a contagem do dia.
- **Publicar** (`publishVersion`, em `domain/publications/publish.ts`): exige
  `content.publish`, só a versão mais recente e só em `aprovado`. Na mesma transação, leva
  a versão a `publicado`, grava a linha em `publications` e chama `recordPendingChange`, que
  agenda o build na janela do site. As versões publicadas antes continuam `publicado`, e a
  seleção `published` já pega a mais recente.
- **Contagem do dia:** são as linhas do site com `published_at` na faixa
  `[início do dia de São Paulo, +1 dia)` do instante `now`, calculada no Postgres
  (`date_trunc` com `at time zone`). O `now` é injetável, para os testes. A publicação que
  passaria do limite é recusada com `publication.daily_limit`.
- **Concorrência:** a trava de `contents` (`for update`, como na aprovação) serializa o
  mesmo conteúdo. Depois dela, a linha de `sites` é travada com `for no key update`, para
  duas publicações de conteúdos diferentes não contarem a mesma vaga. Esse modo não espera
  as gravações com chave estrangeira para o site (`for key share`), então salvar conteúdo
  não entra em impasse com a publicação.
- **Precedência do limite:** coluna operacional `sites.daily_publish_limit` (inteiro, nula,
  `check >= 0`), fora da `SiteConfig` e do snapshot. Nula usa `PUBLISH_DAILY_LIMIT` (padrão
  3), aplicado na partida de cada processo por `configureDailyPublishLimit`. A regra única
  é `effectiveDailyPublishLimit`, como a `effectiveBuildWindowMs` da 0010. O valor `0`
  bloqueia as publicações do site.

## Alternativas consideradas

- **Contar pelo `status` de `content_versions`:** não registra quando nem quem publicou, e a
  despublicação apagaria a publicação do dia.
- **Dia no `timeZone` do site:** descartado no refinamento da workspace#20. A operação conta
  o dia num fuso só.
- **Calcular o dia em JS com `Intl`:** criaria um segundo relógio para a mesma regra. No
  SQL, a faixa usa o índice.
- **Só a trava de `contents`:** duas publicações simultâneas no mesmo site passariam do
  limite.
- **Limite na `SiteConfig`:** iria para o snapshot, e cada ajuste geraria um build sem nada a
  publicar (o mesmo motivo da 0010).

## Consequências

- O agendamento (#488) reserva a vaga gravando a linha com `scheduled_for`. A regra de
  contagem por `published_at` precisa ser revista nessa Task para contar a reserva no dia
  marcado.
- A despublicação não apaga a linha, então não devolve a vaga do dia.
- Publicações de um mesmo site ficam serializadas pela trava do site, por uma transação
  curta.
