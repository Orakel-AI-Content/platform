---
name: tech-debt
description: Cria uma Task issue de débito técnico direto no repositório de código, a partir de um incômodo descrito em linguagem livre ou do número de uma issue Briefing já existente no repositório, medindo no código real a extensão do problema antes de escrever. Entrega a issue com problema, evidência, impacto, resultado esperado e critério de aceite verificável, marcada com o label tech-debt e pronta para /spec. Use quando o usuário invocar explicitamente esta skill via /tech-debt, ou quando outra skill do workflow (/refine) a invocar como subagente — não dispare automaticamente a partir de menções soltas a refatoração, dívida técnica ou código ruim no chat.
---

Esta skill roda no **repositório de código** e cria **uma Task issue marcada
com o label `tech-debt`** nele, pronta para entrar na esteira `/spec` →
`/execute`.

Débito técnico tem um jeito próprio de dar errado: começa como incômodo
("esse módulo está uma bagunça"), vira refatoração sem fronteira e termina num
PR de 2000 linhas que ninguém revisa. O trabalho desta skill é o oposto disso
— **medir o problema no código e delimitar até onde a correção vai**.

A entrada é um incômodo descrito em linguagem livre, ou o número de uma
issue `Briefing` já existente neste repositório (mesmo formato `#<número>`
que o `/planning` aceita no repositório de planejamento — ver Fase 1). O que
você escrever, ou o conteúdo da Briefing referenciada, fica preservado na
seção `## Entrada original`.

## O que esta skill NÃO faz

- **Não refatora nada.** Nenhuma branch, nenhum commit.
- **Não escreve a spec de implementação.** O corpo fica em nível de direção.
  Quem escreve a spec é o `/spec`, imediatamente antes da execução.
- **Não propõe reescrita.** Se o caminho honesto for reescrever o módulo,
  isso não é uma Task de débito técnico avulsa: é caso de `/planning`.

## Contrato de invocação

Por padrão, roda **interativa** no repositório atual: você digita
`/tech-debt <o que está incomodando>`.

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

Sem `repo-alvo`, o alvo é o repositório atual — e a medição da Fase 2
também é a partir daqui. Sem `parent`, a issue nasce sem pai — é o caso
normal da invocação direta.

`caminho local` é obrigatório junto com `repo-alvo`: `gh issue create
--repo` resolve a criação da issue no GitHub independente de onde a sessão
está rodando, mas a medição de código da Fase 2 é sistema de arquivos, não
`gh` — sem esse caminho, não há como ler nem buscar no código de
`repo-alvo`. Quem chama já precisa ter confirmado que o repositório está
acessível localmente (clone irmão ou submodule); se não confirmou, a
invocação está incompleta.

## Fase 1 — Entrada

Na invocação direta, esta skill recebe um dos dois formatos abaixo (não se
aplica ao modo não-interativo do contrato acima, que já chega com os campos
estruturados prontos):

- **`#<número>`** — id de uma issue já existente **neste repositório**
  (ou em `repo-alvo`). Exemplo: `#42`. Só um número puro (sem `#`) não conta
  como id — trate como texto livre.
- **Qualquer outro texto** — o incômodo descrito livremente, do jeito que
  foi escrito.

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

3. Trate `title` + `body` + `comments` como o incômodo relatado nesta
   sessão — inclusive linguagem informal, que costuma carregar o custo real
   ("toda vez que mexo aqui quebra outra coisa"). Nada disso pode
   desaparecer na reformulação (veja Fase 4, "Entrada original").

4. **Esta issue nunca é editada**, em nenhuma hipótese, exceto a marcação
   final de convertida (Fase 5). É a issue de origem desta sessão.

Guarde o número (e o repositório, se veio de `repo-alvo`) — a Fase 5 os
referencia.

### Se o input for texto livre

Guarde o texto **como veio**, íntegro, para a seção `## Entrada original` —
inclusive o incômodo em linguagem informal, que costuma carregar o custo
real ("toda vez que mexo aqui quebra outra coisa").

### Nos dois casos

Separe **sintoma** de **causa**. "O código está confuso" é sintoma; a causa
é o que a Fase 2 vai encontrar.

## Fase 2 — Medição (silenciosa)

Antes de escrever qualquer coisa:

1. Leia o `CLAUDE.md` deste repositório: stack, arquitetura, convenções de
   design de código. Débito técnico é, quase sempre, distância entre o código
   e a convenção escrita ali.
2. **Meça a extensão.** Quantos arquivos, quais módulos, quantas ocorrências
   do padrão problemático. Um débito de 3 ocorrências e um de 300 são
   problemas diferentes, com fronteiras diferentes.
3. **Meça a cobertura de teste da área.** Refatorar sem teste é mudar código
   no escuro: se a cobertura for fraca, acrescentar teste antes costuma ser a
   primeira fatia — e às vezes vira a issue inteira.
4. **Procure o acoplamento.** O que depende disso? Mudar aqui quebra o quê? É
   o que determina se a correção cabe num PR ou não.
5. Confirme que **todo arquivo que você vai citar como existente existe**.

**Essa medição serve para você ter confiança na direção técnica e na
fronteira, não para virar detalhe no corpo.** Nomeie módulos e arquivos;
**nunca cite número de linha nem cole trecho de código** — a issue pode ficar
semanas na fila, e débito técnico é justamente a área que mais muda de forma
sem mudar de natureza.

Não narre a medição. No máximo duas linhas de resumo.

## Fase 3 — Perguntas (só quando necessário)

**Em modo não-interativo, não pergunte nada** — registre a dúvida e vá para a
Fase 6.

Em modo interativo, pergunte só o que o código não responde. As duas
perguntas que costumam valer aqui: **até onde ir** (a fronteira da
refatoração) e **o que motivou agora** (um incidente? uma feature que vem por
aí e vai doer?), porque a motivação é o que vai para `## Impacto` e é o que
justifica priorizar.

Antes de perguntar, teste: *uma resposta diferente mudaria o escopo, o
critério de aceite ou a direção técnica?* Se não mudaria, não pergunte.

Quando precisar perguntar, siga o protocolo do workflow: **uma pergunta por
vez**, com a sua suposição já formulada, e **encerre o turno** aguardando a
resposta. Nunca liste várias perguntas juntas nem adiante as próximas.

**Ponto de checagem, não parede:** se depois de 3 perguntas você ainda
precisar de mais, avise antes de continuar, com o motivo concreto.

Nunca assuma em silêncio. Se decidir não perguntar, declare a suposição.

## Fase 4 — Redação

Monte o corpo no formato abaixo:

```markdown
## Problema
[O que está errado no código hoje, 2-3 linhas. O problema, não a solução.]

## Evidência
[Onde dói: módulos e arquivos (sem número de linha), quantas ocorrências,
sintomas observáveis, incidentes, tempo perdido. O que a Fase 2 mediu.]

## Impacto
[O que essa dívida custa: risco, lentidão de entrega, bugs recorrentes.
Por que pagar agora e não depois.]

## Resultado esperado
[Como fica depois, em termos de capacidade e qualidade — não de
implementação.]

## Escopo
[O que muda.]
Arquivos existentes a modificar: [caminhos confirmados na Fase 2]
Arquivos novos a criar: [se houver]

## Fora de escopo
- [a fronteira da refatoração: o que fica para depois, mesmo estando perto
  e mesmo incomodando]

## Critérios de aceite
- [ ] [verificável por comando ou teste]

## Direção técnica
[Uma linha: qual abordagem seguir, qual abstração introduzir ou reusar.]

## Classe
[normalmente `refatoração`; `aditiva` quando a fatia é só acrescentar teste]

## Entrada original
[Se a entrada foi `#<número>`, referencie a issue de origem preservada
(#<número>) e sintetize seu conteúdo, sem duplicar o corpo inteiro — ele
permanece preservado nela, intocado. Se foi texto livre, preserve como
veio.]
```

### Regras de qualidade — verifique antes de mostrar

São as mesmas que o `/spec` usa para reprovar uma issue, e uma extra que é
específica de débito técnico:

- Direção técnica em **uma linha**, presente.
- Nenhum critério de aceite subjetivo. **É aqui que débito técnico falha
  mais:** "o código fica mais legível" e "melhorar a manutenibilidade" não
  são critérios. Verificável é: "nenhum arquivo em `src/domain/` importa de
  `src/infra/`", "a função `validate()` tem no máximo um nível de
  aninhamento", "os testes em `tests/invite/` passam", "o lint passa sem a
  regra desabilitada".
- **"Fora de escopo" nunca fica vazia — e aqui ela é a seção mais
  importante.** É a fronteira que impede a refatoração de vazar. Liste o que
  está perto, incomoda e mesmo assim não entra.
- Nenhum arquivo citado em "Arquivos existentes a modificar" é suposição.
- Nenhum número de linha, em nenhuma seção.

**Regra de tamanho: uma issue = um PR revisável de uma vez.** Se a
refatoração previsível passa de ~400 linhas de diff ou toca mais de 5-6
arquivos, **quebre em fatias e crie só a primeira**, dizendo ao usuário quais
seriam as seguintes. Se nem fatiado couber — o caminho honesto é reescrever
—, pare e diga que o caso é de `/planning`.

Fatia boa de débito técnico tem uma propriedade: a `main` continua
releasable depois dela. Se a primeira fatia deixa o código pela metade, a
fronteira está errada.

### Nível de prontidão

- **Padrão — `Refined`.** A issue nasce pronta para o `/spec`, que vai reler
  o código e escrever a spec imediatamente antes da execução. Débito técnico
  quase sempre cai aqui: a forma do código muda, e a spec precisa ser escrita
  contra o código do momento.
- **`sem-spec` — `Ready`.** Só para o que não depende de reler código: bump
  de dependência, remoção de arquivo morto já confirmado, renomeação
  mecânica. Aplique o label `sem-spec` e mande direto para `Ready`.

### Aprovação

Em modo interativo, **mostre o corpo completo no chat e peça aprovação antes
de criar qualquer coisa no GitHub.** Em modo não-interativo, siga direto para
a Fase 5.

## Fase 5 — Criação

1. Crie a issue:

   ```bash
   gh issue create --repo <ORG>/<repo-alvo> \
     --type Task \
     --label tech-debt \
     --title "<título curto, no imperativo>" \
     --body-file <arquivo com o corpo aprovado> \
     --project "<Nome do Project>"
   ```

   O label `tech-debt` é obrigatório — é ele que torna a dívida visível e
   mensurável no board, do mesmo jeito que o `/planning` já marca Story de
   débito técnico no repositório de planejamento. Acrescente `--parent <URL
   da issue de planejamento>` quando houver pai, e `--label sem-spec` quando
   a Fase 4 tiver marcado assim.

2. Mova o card no Project — a issue nasce refinada e nunca fica em `Backlog`.
   Use `gh project item-edit`: resolva `PROJECT_ID`, o `field-id` de `Status`
   e o `option-id` alvo, depois o `id` do item pela URL da issue recém-criada
   (ver `SETUP.md`, "Transições via comando").

   - **Padrão:** `option-id` de `Refined`.
   - **Marcada `sem-spec`:** `option-id` de `Ready`.

3. Comente na issue, título **"Contexto do /tech-debt"**, com a data, as
   perguntas feitas e as respostas na íntegra (se houve), o que a medição
   encontrou (extensão, cobertura de teste, acoplamento) e, se você fatiou,
   quais seriam as fatias seguintes. É o que evita remedir tudo depois.

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

Se faltar algo que você não consegue resolver — não dá para delimitar a
fronteira sem uma decisão que não é sua, a medição contradiz a premissa da
entrada, o critério de aceite só sairia subjetivo — **não invente e não trave
a sessão**:

1. Crie a issue mesmo assim, com o que você apurou, acrescentando ao corpo a
   seção `## Perguntas em aberto` com o que falta e a suposição que você
   adotaria se fosse forçado a decidir sozinho.
2. Marque com `needs-human`:

   ```bash
   gh issue edit <número> --repo <ORG>/<repo-alvo> --add-label needs-human
   ```

3. Comente na issue, título **"Escalonamento do /tech-debt"**, com o que está
   em aberto e por que isso impede a issue de seguir sozinha.
4. Deixe o card em `Refined` e encerre.

## Fase 7 — Fechamento

Em modo interativo, informe: número e URL da issue, o Status em que ela
nasceu, as fatias seguintes se você fatiou, e o próximo comando — `/spec
<número>` se ficou em `Refined`, `/execute <número>` se ficou em `Ready`.

Em modo não-interativo, devolva ao chamador uma linha só, nesta forma:

```
<ORG>/<repo-alvo>#<número> · <URL> · <Refined|Ready> · <ok|escalou>
```
