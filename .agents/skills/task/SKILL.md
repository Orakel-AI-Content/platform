---
name: task
description: Cria uma Task issue técnica direto no repositório de código, sem passar por Epic ou Story, a partir de uma descrição livre ou do número de uma issue Briefing já existente no repositório. Analisa o código real antes de escrever, para que escopo, critério de aceite e direção técnica saiam concretos, e entrega a issue pronta para /spec (ou para /execute, quando trivial). Use quando o usuário invocar explicitamente esta skill via /task, ou quando outra skill do workflow (/refine) a invocar como subagente — não dispare automaticamente a partir de menções soltas a tarefas ou issues no chat.
---

Esta skill roda no **repositório de código** e cria **uma Task issue** nele,
pronta para entrar na esteira `/spec` → `/execute`.

Ela existe para a demanda que já nasce técnica e pequena demais para
justificar o caminho `/planning` → `/refine`: um ajuste de infraestrutura, uma
melhoria pontual, uma mudança que você já sabe descrever. **Uma invocação, uma
issue.**

A entrada é uma descrição livre, ou o número de uma issue `Briefing` já
existente neste repositório (mesmo formato `#<número>` que o `/planning`
aceita no repositório de planejamento — ver Fase 1). O que você escrever, ou
o conteúdo da Briefing referenciada, fica preservado na seção `## Entrada
original` da issue — a skill reformula o resto, mas nunca perde o que foi
dito.

## O que esta skill NÃO faz

- **Não escreve a spec de implementação.** O corpo fica em nível de direção,
  igual ao que o `/refine` produz. Detalhe de implementação envelhece: quem
  escreve isso é o `/spec`, imediatamente antes da execução, contra o código
  como ele estiver naquele momento.
- **Não cria mais de uma issue.** Se a demanda não couber num PR revisável
  (ver Fase 4), pare e diga que o caso é de `/planning`.
- **Não implementa nada.** Nenhuma branch, nenhum commit.

## Contrato de invocação

Por padrão, roda **interativa** no repositório atual: você digita `/task <o
que precisa ser feito>`.

Quando o `/refine` a invoca como subagente, o prompt traz este bloco — e a
presença da marca `modo: não-interativo` muda o comportamento da Fase 3 e da
Fase 4:

```
modo: não-interativo
repo-alvo: <ORG>/<repo-destino>
caminho local: <caminho do clone de repo-alvo no disco>
parent: <URL da issue de planejamento>   (opcional)
título: <título curto>
direção técnica: <uma linha>
critério de aceite: <uma linha>
classe: <mecânica | aditiva | refatoração | feature>
contexto: <o que o /refine apurou sobre este item>
```

Sem `repo-alvo`, o alvo é o repositório atual — e a exploração da Fase 2
também é a partir daqui. Sem `parent`, a issue nasce sem pai — é o caso
normal da invocação direta.

`caminho local` é obrigatório junto com `repo-alvo`: `gh issue create
--repo` resolve a criação da issue no GitHub independente de onde a sessão
está rodando, mas a exploração de código da Fase 2 é sistema de arquivos, não
`gh` — sem esse caminho, não há como ler nem buscar no código de `repo-alvo`.
Quem chama já precisa ter confirmado que o repositório está acessível
localmente (clone irmão ou submodule); se não confirmou, a invocação está
incompleta.

## Fase 1 — Entrada

Na invocação direta, esta skill recebe um dos dois formatos abaixo (não se
aplica ao modo não-interativo do contrato acima, que já chega com os campos
estruturados prontos):

- **`#<número>`** — id de uma issue já existente **neste repositório**
  (ou em `repo-alvo`). Exemplo: `#42`. Só um número puro (sem `#`) não conta
  como id — trate como texto livre.
- **Qualquer outro texto** — a descrição livre da demanda, do jeito que foi
  escrita.

Determine o modo (interativo por padrão) e o alvo (repositório atual por
padrão), pelo contrato de invocação acima, antes de seguir.

### Se o input for `#<número>`

1. Busque a issue neste repositório (ou em `repo-alvo`):

   ```bash
   gh issue view <número> --repo <ORG>/<repo-alvo> --json title,body,comments,url,state,issueType
   ```

   Se a issue não existir, já estiver fechada, ou pertencer a outro
   repositório, **pare e avise o usuário** — não adivinhe qual issue ele
   quis dizer. Em modo não-interativo, isso é escalonamento (Fase 6).

2. **Verifique o `issueType`.** Vazio ou `Briefing` seguem normalmente. Se
   já tiver outro type formal (`Task`, `Bug`, `Epic`, `Story`), **pare e
   avise** (ou escale, em modo não-interativo): essa issue já é outra coisa,
   não uma Briefing para processar — não decida por conta própria qual das
   duas prevalece.

3. Trate `title` + `body` + `comments` como a matéria-prima desta sessão —
   preste atenção especial a qualquer detalhe técnico (mensagens de erro,
   trechos de código, decisões já cogitadas) e a imagens/arquivos anexados
   embutidos no corpo em markdown — nada disso pode se perder ao reformular
   (veja Fase 4, "Entrada original").

4. **Esta issue nunca é editada**, em nenhuma hipótese, exceto a marcação
   final de convertida (Fase 5). É a issue de origem desta sessão.

Guarde o número (e o repositório, se veio de `repo-alvo`) — a Fase 5 os
referencia.

### Se o input for texto livre

Guarde o texto **como veio**. Ele vai íntegro para `## Entrada original` no
corpo da issue: mensagens de erro, nomes de arquivo, decisões já cogitadas,
links. Reformular para as outras seções é, por definição, perder alguma
coisa — e é isso que essa seção existe para evitar.

Se a entrada estiver vazia ou for genérica demais para virar uma issue
("melhorar o código", "arrumar isso"), **pare e peça a descrição** — não
invente escopo. Em modo não-interativo, isso é escalonamento (Fase 6).

## Fase 2 — Contexto (silencioso)

Antes de escrever qualquer coisa:

1. Leia o `CLAUDE.md` deste repositório: stack, arquitetura, convenções de
   código e, se a Task tocar interface, as diretrizes de layout.
2. Explore o código de verdade — busca, não suposição. Encontre os arquivos,
   módulos, rotas, testes e abstrações que a mudança vai tocar, e o padrão
   que ela deve seguir (como algo parecido já é feito aqui).
3. Confirme que **todo arquivo que você vai citar como existente existe**. O
   `/spec` reprova a issue se citar um caminho que não existe — pegar isso
   agora evita o escalonamento depois.

**Essa análise serve para você ter confiança, não para virar detalhe no
corpo.** O que entra na issue é a direção: qual abordagem seguir, qual
abstração reusar, quais arquivos a mudança toca. Não liste funções a criar,
assinaturas, campos ou ordem de implementação.

Não narre a exploração. No máximo duas linhas de resumo.

## Fase 3 — Perguntas (só quando necessário)

**Em modo não-interativo, não pergunte nada** — registre a dúvida e vá para a
Fase 6.

Em modo interativo, pergunte só o que o código não responde e o que muda o
resultado. Antes de formular a pergunta, teste: *uma resposta diferente
mudaria o escopo, o critério de aceite ou a direção técnica?* Se não mudaria,
não pergunte. Se o código responde, vá ler o código.

Quando precisar perguntar, siga o protocolo do workflow: **uma pergunta por
vez**, com a sua suposição já formulada, e **encerre o turno** aguardando a
resposta. Nunca liste várias perguntas juntas nem adiante as próximas.

**Ponto de checagem, não parede:** se depois de 3 perguntas você ainda
precisar de mais, avise antes de continuar — diga o motivo concreto e
pergunte se o usuário prefere seguir ou parar para ajustar a demanda. Muita
pergunta aqui é sinal de que o caso talvez seja de `/planning`, não de
`/task`.

Nunca assuma em silêncio para economizar pergunta. Se decidir não perguntar,
declare a suposição adotada.

## Fase 4 — Redação

Monte o corpo no formato abaixo:

```markdown
## Contexto
[Uma a três frases. Por que isso existe. Se houver issue-pai, referencie.]

## Escopo
[O que muda neste repositório.]
Arquivos existentes a modificar: [caminhos confirmados na Fase 2 — têm que
existir de fato, não liste por suposição]
Arquivos novos a criar: [caminhos que a direção técnica prevê criar]

## Fora de escopo
- [o que explicitamente não entra]

## Critérios de aceite
- [ ] [verificável, sem julgamento subjetivo]

## Direção técnica
[Uma linha: qual abordagem seguir, qual abstração reusar.]

## Classe
[mecânica | aditiva | refatoração | feature]

## Entrada original
[Se a entrada foi `#<número>`, referencie a issue de origem preservada
(#<número>) e sintetize seu conteúdo, sem duplicar o corpo inteiro — ele
permanece preservado nela, intocado. Se foi texto livre, preserve o texto
como veio.]
```

Se sobrou pergunta sem resposta, acrescente `## Perguntas em aberto` com o
que ficou pendente e a suposição adotada.

### Regras de qualidade — verifique antes de mostrar

São as mesmas que o `/spec` usa para reprovar uma issue. Conferir aqui evita
que ela escale depois por algo que já dava para ver agora:

- Direção técnica em **uma linha**, presente. Se você não consegue dar a
  direção sem ler o código a fundo, o escopo está grande ou mal delimitado.
- Nenhum critério de aceite subjetivo. "Melhorar a performance" não é
  critério; "responde em menos de 200ms com 1000 registros" é.
- "Fora de escopo" nunca fica vazia. Sem nada óbvio, liste as melhorias
  adjacentes que alguém naturalmente faria junto e que não entram.
- Nenhum arquivo citado em "Arquivos existentes a modificar" é suposição.

**Regra de tamanho: uma issue = um PR revisável de uma vez.** Se a
implementação previsível passa de ~400 linhas de diff ou toca mais de 5-6
arquivos, **pare**: isso não é uma Task avulsa. Diga ao usuário que o caso
pede `/planning` (para virar Story) e não crie nada.

### Nível de prontidão

- **Padrão — `Refined`.** A issue nasce pronta para o `/spec`, que vai reler
  o código e escrever a spec imediatamente antes da execução.
- **`sem-spec` — `Ready`.** Só para o que não depende de reler código: bump
  de dependência, mudança de config, ajuste óbvio. Aplique o label
  `sem-spec` e mande direto para `Ready`. Na dúvida, não marque: um `/spec` a
  mais custa pouco; uma execução às cegas custa caro.

### Aprovação

Em modo interativo, **mostre o corpo completo no chat e peça aprovação antes
de criar qualquer coisa no GitHub.** Pergunte se o usuário aprova, quer
ajustar ou prefere descartar.

Em modo não-interativo, não peça aprovação — siga direto para a Fase 5.

## Fase 5 — Criação

1. Crie a issue:

   ```bash
   gh issue create --repo <ORG>/<repo-alvo> \
     --type Task \
     --title "<título curto, no imperativo>" \
     --body-file <arquivo com o corpo aprovado> \
     --project "<Nome do Project>" \
     --assignee @me
   ```

   `--assignee @me` atribui a issue a quem rodou a skill — o usuário
   autenticado no `gh`, também quando a skill roda como subagente do
   `/refine`.

   Acrescente `--parent <URL da issue de planejamento>` quando houver pai, e
   `--label sem-spec` quando a Fase 4 tiver marcado assim. Se a Fase 2 ou o
   usuário identificaram uma issue bloqueadora, acrescente `--blocked-by
   <número-ou-URL>`.

2. Mova o card no Project — a issue nasce refinada e nunca fica em `Backlog`.
   Use `gh project item-edit`: resolva `PROJECT_ID`, o `field-id` de `Status`
   e o `option-id` alvo, depois o `id` do item pela URL da issue recém-criada
   (ver `SETUP.md`, "Transições via comando").

   - **Padrão:** `option-id` de `Refined`.
   - **Marcada `sem-spec`:** `option-id` de `Ready`.

3. Comente na issue, título **"Contexto do /task"**, com a data, as perguntas
   feitas e as respostas na íntegra (se houve), e as suposições declaradas.
   Quando a entrada foi texto livre, este comentário é a única memória de
   como a issue foi construída; quando foi `#<número>`, a issue de origem
   (passo 4 abaixo) já preserva o histórico completo.

   ```bash
   gh issue comment <número> --repo <ORG>/<repo-alvo> --body-file <comentário>
   ```

4. **Se a entrada foi `#<número>`**, feche a issue de origem e marque-a como
   convertida:

   ```bash
   gh issue comment <número-da-origem> --repo <ORG>/<repo-alvo> \
     --body "Convertida em #<número-da-issue-nova>."
   gh issue close <número-da-origem> --repo <ORG>/<repo-alvo> --reason completed
   gh issue edit <número-da-origem> --repo <ORG>/<repo-alvo> --add-label planned
   ```

   O fechamento move o card da origem para `Done` sozinho (workflow nativo
   "item closed") — sem precisar mexer no Status manualmente.

## Fase 6 — Escalonamento

Se faltar algo que você não consegue resolver — a demanda é ambígua demais, o
código contradiz a entrada, não dá para dar direção técnica sem uma decisão
que não é sua — **não invente e não trave a sessão**:

1. Crie a issue mesmo assim, com o que você apurou, acrescentando ao corpo a
   seção `## Perguntas em aberto` com o que falta e a suposição que você
   adotaria se fosse forçado a decidir sozinho.
2. Marque com `needs-human`:

   ```bash
   gh issue edit <número> --repo <ORG>/<repo-alvo> --add-label needs-human
   ```

3. Comente na issue, título **"Escalonamento do /task"**, com o que está em
   aberto e por que isso impede a issue de seguir sozinha.
4. Deixe o card em `Refined` e encerre.

O `/execute` para sozinho ao ver `needs-human`, então nada sai da esteira por
engano. Resolvido o ponto e removido o label, a issue segue o fluxo normal.

## Fase 7 — Fechamento

Em modo interativo, informe: número e URL da issue, o Status em que ela
nasceu e o próximo comando — `/spec <número>` se ficou em `Refined`,
`/execute <número>` se ficou em `Ready`.

Em modo não-interativo, devolva ao chamador uma linha só, nesta forma:

```
<ORG>/<repo-alvo>#<número> · <URL> · <Refined|Ready> · <ok|escalou>
```
