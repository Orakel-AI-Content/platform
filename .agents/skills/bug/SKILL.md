---
name: bug
description: Cria uma issue de Bug direto no repositório de código a partir de um relato de defeito ou do número de uma issue Briefing já existente no repositório, investigando o código para localizar a causa raiz antes de escrever. Entrega a issue com sintoma, reprodução, causa raiz, escopo da correção e critério de aceite baseado em teste de regressão, pronta para /spec (ou para /execute, quando trivial). Use quando o usuário invocar explicitamente esta skill via /bug, ou quando outra skill do workflow (/refine) a invocar como subagente — não dispare automaticamente a partir de menções soltas a erros, falhas ou bugs no chat.
---

Esta skill roda no **repositório de código** e cria **uma issue do tipo
`Bug`** nele, pronta para entrar na esteira `/spec` → `/execute`.

A diferença para as outras skills de entrada é o trabalho de **investigação**:
um relato de defeito é um sintoma, e sintoma não é escopo. A skill lê o código
para transformar "o convite falha silenciosamente" em "a validação de convite
em `src/services/invite.ts` não trata endereço já convidado".

A entrada é um relato livre, ou o número de uma issue `Briefing` já existente
neste repositório (mesmo formato `#<número>` que o `/planning` aceita no
repositório de planejamento — ver Fase 1). O relato — escrito ou vindo da
Briefing referenciada — fica preservado na seção `## Entrada original`,
inclusive stack trace, log e print, que costumam ser a parte mais valiosa e a
primeira a se perder numa reformulação.

## O que esta skill NÃO faz

- **Não corrige o bug.** Nenhuma branch, nenhum commit. Quem implementa é o
  `/execute`, depois.
- **Não escreve a spec de implementação.** O corpo fica em nível de direção.
  Detalhe de implementação envelhece; quem escreve isso é o `/spec`,
  imediatamente antes da execução.
- **Não inventa causa raiz.** Se a investigação não confirmar, a seção diz
  "não confirmada" — e o `/spec` investiga de novo com o código do momento.

## Contrato de invocação

Por padrão, roda **interativa** no repositório atual: você digita `/bug <o que
está acontecendo de errado>`.

Quando o `/refine` a invoca como subagente, o prompt traz este bloco — e a
presença da marca `modo: não-interativo` muda o comportamento da Fase 4 e da
Fase 5:

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

Sem `repo-alvo`, o alvo é o repositório atual — e a investigação da Fase 2
também é a partir daqui. Sem `parent`, a issue nasce sem pai — é o caso
normal da invocação direta.

`caminho local` é obrigatório junto com `repo-alvo`: `gh issue create
--repo` resolve a criação da issue no GitHub independente de onde a sessão
está rodando, mas a investigação de código da Fase 2 é sistema de arquivos,
não `gh` — sem esse caminho, não há como ler nem buscar no código de
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
- **Qualquer outro texto** — o relato livre do defeito, do jeito que foi
  escrito.

Determine o modo (interativo por padrão) e o alvo (repositório atual por
padrão), pelo contrato de invocação acima, antes de seguir.

### Se o input for `#<número>`

1. Busque a issue neste repositório (ou em `repo-alvo`):

   ```bash
   gh issue view <número> --repo <ORG>/<repo-alvo> --json title,body,comments,url,state,issueType
   ```

   Se a issue não existir, já estiver fechada, ou pertencer a outro
   repositório, **pare e avise o usuário** — não adivinhe qual issue ele
   quis dizer. Em modo não-interativo, isso é escalonamento (Fase 7).

2. **Verifique o `issueType`.** Vazio ou `Briefing` seguem normalmente. Se
   já tiver outro type formal (`Task`, `Bug`, `Epic`, `Story`), **pare e
   avise** (ou escale, em modo não-interativo): essa issue já é outra coisa,
   não uma Briefing para processar — não decida por conta própria qual das
   duas prevalece.

3. Trate `title` + `body` + `comments` como o relato desta sessão: mensagem
   de erro, stack trace, passos descritos, ambiente, links. Nada disso pode
   desaparecer na reformulação (veja Fase 5, "Entrada original").

4. **Esta issue nunca é editada**, em nenhuma hipótese, exceto a marcação
   final de convertida (Fase 6). É a issue de origem desta sessão.

Guarde o número (e o repositório, se veio de `repo-alvo`) — a Fase 6 os
referencia.

### Se o input for texto livre

Guarde o relato **como veio**, íntegro, para a seção `## Entrada original`:
mensagem de erro, stack trace, passos que o usuário descreveu, ambiente,
links. Nada disso pode desaparecer na reformulação.

### Nos dois casos

Separe, já na leitura, o que é **fato observado** (o que aconteceu) do que é
**hipótese** de quem relatou ("acho que é o cache"). Hipótese de terceiro não
vira causa raiz sem confirmação no código — no máximo orienta onde procurar
primeiro.

## Fase 2 — Investigação (silenciosa)

Antes de escrever qualquer coisa:

1. Leia o `CLAUDE.md` deste repositório: stack, arquitetura, convenções.
2. **Localize o caminho do código que produz o sintoma.** Vá do ponto de
   entrada (rota, comando, evento, tela) até onde o comportamento se decide.
   Use busca, não suposição.
3. **Procure a causa raiz.** O que está errado: uma validação que não cobre um
   caso, uma condição invertida, um estado não tratado, uma premissa que
   deixou de valer. Confirme lendo o código — não deduza pelo sintoma.
4. **Veja os testes que cobrem a área.** Existe teste? Ele passa hoje? Um bug
   que passa nos testes existentes revela onde falta cobertura, e isso vira
   critério de aceite.
5. Se o relato trouxe passos de reprodução, confira se eles batem com o que o
   código faz. Divergência entre relato e código é informação, não erro do
   relato — registre.

**Essa investigação serve para você ter confiança na direção técnica e no
escopo, não para virar detalhe no corpo.** Nomeie arquivo e natureza do
defeito; **nunca cite número de linha nem cole trecho de código** — a issue
pode ficar semanas na fila e linha é a primeira coisa que muda.

Não narre a investigação. No máximo duas linhas de resumo.

## Fase 3 — Quando a causa raiz não aparece

Investigação sem achado é resultado legítimo, não fracasso. Se depois de uma
busca honesta a causa não estiver confirmada, **não force**: escreva `## Causa
raiz` como "não confirmada" e registre em `## Perguntas em aberto` o que você
descartou e onde suspeita que esteja. O `/spec` recebe isso como ponto de
partida e investiga com o código do momento.

Inventar uma causa raiz plausível é pior do que não ter nenhuma: ela vira
direção técnica, e a direção técnica é vinculante para o `/spec`.

## Fase 4 — Perguntas (só quando necessário)

**Em modo não-interativo, não pergunte nada** — registre a dúvida e vá para a
Fase 7.

Em modo interativo, pergunte só o que o código não responde. O caso mais
comum aqui é reprodução: entrada exata, ambiente, versão, se é intermitente,
desde quando acontece. Antes de perguntar, teste: *uma resposta diferente
mudaria o escopo da correção, o critério de aceite ou a direção técnica?* Se
não mudaria, não pergunte.

Quando precisar perguntar, siga o protocolo do workflow: **uma pergunta por
vez**, com a sua suposição já formulada, e **encerre o turno** aguardando a
resposta. Nunca liste várias perguntas juntas nem adiante as próximas.

**Ponto de checagem, não parede:** se depois de 3 perguntas você ainda
precisar de mais, avise antes de continuar, com o motivo concreto.

Nunca assuma em silêncio. Se decidir não perguntar, declare a suposição.

## Fase 5 — Redação

Monte o corpo no formato abaixo:

```markdown
## Sintoma
[O que acontece de errado, do ponto de vista de quem usa ou de quem chama.
Uma a três frases.]

## Reprodução
[Passos, entrada e ambiente. Se não foi possível reproduzir, escreva "não
reproduzido" e diga o que foi tentado.]

## Comportamento esperado
[O que deveria acontecer no lugar.]

## Evidência
[Log, stack trace, print, teste que falha — o que veio no relato.]

## Causa raiz
[Arquivo e natureza do defeito, sem número de linha. Ex.: "a validação de
convite em `src/services/invite.ts` não trata endereço já convidado".
Ou "não confirmada", com o que foi descartado.]

## Escopo
[O que muda para corrigir.]
Arquivos existentes a modificar: [caminhos confirmados na Fase 2]
Arquivos novos a criar: [normalmente só o arquivo de teste, se não houver]

## Fora de escopo
- [o que não entra — principalmente os problemas adjacentes que a
  investigação revelou e que não são este bug]

## Critérios de aceite
- [ ] [prefira o teste de regressão: "o teste X, que falha hoje, passa"]

## Direção técnica
[Uma linha: por onde corrigir, qual abstração usar.]

## Classe
[mecânica | aditiva | refatoração | feature]

## Entrada original
[Se a entrada foi `#<número>`, referencie a issue de origem preservada
(#<número>) e sintetize seu conteúdo, sem duplicar o corpo inteiro — ele
permanece preservado nela, intocado. Se foi relato livre, preserve como
veio.]
```

**Sobre a `Classe`:** correção de bug não tem valor próprio na lista — use o
mais próximo do que a correção faz. Ajuste pontual de uma linha ou duas →
`mecânica`. Validação ou guarda nova em código já coberto → `aditiva`.
Correção que exige reestruturar para o defeito não voltar → `refatoração`.

### Regras de qualidade — verifique antes de mostrar

São as mesmas que o `/spec` usa para reprovar uma issue:

- Direção técnica em **uma linha**, presente.
- Nenhum critério de aceite subjetivo. "O bug não acontece mais" não é
  critério verificável; "o teste `tests/invite_test.ts::convite duplicado`,
  que falha hoje, passa" é.
- "Fora de escopo" nunca fica vazia. Investigação de bug quase sempre revela
  problema adjacente — é exatamente ali que ele deve ser listado, para não
  vazar para o PR.
- Nenhum arquivo citado em "Arquivos existentes a modificar" é suposição.
- Nenhum número de linha, em nenhuma seção.

**Regra de tamanho: uma issue = um PR revisável de uma vez.** Se a correção
previsível passa de ~400 linhas de diff ou toca mais de 5-6 arquivos, o que
você encontrou provavelmente não é um bug isolado — é débito técnico. Diga
isso e sugira `/tech-debt`.

### Nível de prontidão

- **Padrão — `Refined`.** A issue nasce pronta para o `/spec`, que vai reler
  o código e escrever a spec imediatamente antes da execução. **Bug com causa
  raiz confirmada continua entrando aqui** — confirmar a causa não dispensa
  reler o código na hora de corrigir.
- **`sem-spec` — `Ready`.** Só para o que não depende de reler código: bump
  de dependência que corrige o defeito, ajuste de config, typo. Aplique o
  label `sem-spec` e mande direto para `Ready`.

### Aprovação

Em modo interativo, **mostre o corpo completo no chat e peça aprovação antes
de criar qualquer coisa no GitHub.** Em modo não-interativo, siga direto para
a Fase 6.

## Fase 6 — Criação

1. Crie a issue:

   ```bash
   gh issue create --repo <ORG>/<repo-alvo> \
     --type Bug \
     --title "<título curto: o sintoma, não a causa>" \
     --body-file <arquivo com o corpo aprovado> \
     --project "<Nome do Project>" \
     --assignee @me
   ```

   `--assignee @me` atribui a issue a quem rodou a skill — o usuário
   autenticado no `gh`, também quando a skill roda como subagente do
   `/refine`.

   Acrescente `--parent <URL da issue de planejamento>` quando houver pai, e
   `--label sem-spec` quando a Fase 5 tiver marcado assim.

2. Mova o card no Project — a issue nasce refinada e nunca fica em `Backlog`.
   Use `gh project item-edit`: resolva `PROJECT_ID`, o `field-id` de `Status`
   e o `option-id` alvo, depois o `id` do item pela URL da issue recém-criada
   (ver `SETUP.md`, "Transições via comando").

   - **Padrão:** `option-id` de `Refined`.
   - **Marcada `sem-spec`:** `option-id` de `Ready`.

3. Comente na issue, título **"Contexto do /bug"**, com a data, as perguntas
   feitas e as respostas na íntegra (se houve), o que a investigação
   descartou, e as suposições declaradas — o que evita refazer a mesma busca
   se a causa raiz se provar errada. Quando a entrada foi `#<número>`, a
   issue de origem (passo 4 abaixo) preserva o relato original; este
   comentário é sobre a investigação em si, nos dois casos.

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

## Fase 7 — Escalonamento

Se faltar algo que você não consegue resolver — o relato é vago demais para
virar issue, o código contradiz o relato, a correção depende de uma decisão de
produto — **não invente e não trave a sessão**:

1. Crie a issue mesmo assim, com o que você apurou, acrescentando ao corpo a
   seção `## Perguntas em aberto` com o que falta e a suposição que você
   adotaria se fosse forçado a decidir sozinho.
2. Marque com `needs-human`:

   ```bash
   gh issue edit <número> --repo <ORG>/<repo-alvo> --add-label needs-human
   ```

3. Comente na issue, título **"Escalonamento do /bug"**, com o que está em
   aberto e por que isso impede a issue de seguir sozinha.
4. Deixe o card em `Refined` e encerre.

Causa raiz não confirmada, sozinha, **não** é motivo de escalonamento — é um
resultado previsto (Fase 3) e a issue segue normalmente para o `/spec`.

## Fase 8 — Fechamento

Em modo interativo, informe: número e URL da issue, o Status em que ela
nasceu e o próximo comando — `/spec <número>` se ficou em `Refined`,
`/execute <número>` se ficou em `Ready`.

Em modo não-interativo, devolva ao chamador uma linha só, nesta forma:

```
<ORG>/<repo-alvo>#<número> · <URL> · <Refined|Ready> · <ok|escalou>
```
