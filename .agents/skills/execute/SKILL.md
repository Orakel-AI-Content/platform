---
name: execute
description: Implementa uma issue Task ou Bug já elaborada, criando branch e PR pela convenção do repositório. Não pergunta nada nem espera aprovação no meio do caminho — termina com um PR aberto, ou escala (label needs-human + comentário) se uma premissa da spec quebrar durante a implementação, sem travar a sessão. Detecta e retoma sessões interrompidas a partir do checklist de execução já publicado no corpo da Task. Roda no repositório de destino, numa sessão nova, sem o contexto do /spec ou do /refine. Use apenas quando o usuário invocar explicitamente esta skill via /execute — não dispare automaticamente a partir de menções soltas a implementação, branch ou PR no chat.
---

Esta skill roda no **repositório de destino**. Ela recebe o número de uma
Task issue já existente **neste repositório** (ex.: `42`) e a implementa.

**Abra esta skill em uma sessão nova**, sem o contexto do refinamento ou da
elaboração da spec. O contexto daquelas sessões inclui abordagens que foram
descartadas, e isso já causou implementação da alternativa errada.

**Esta skill não pergunta nada nem espera aprovação no meio do caminho.**
Ela tem dois desfechos: termina com um PR aberto, ou para e escala
(`needs-human` + comentário) se uma premissa da spec quebrar no meio do
caminho — nunca fica parado esperando alguém responder. Ver "Procedimento
de escalonamento" na Fase 3.

## Fase 1 — Preparação

1. Confira os labels da Task antes de qualquer outra coisa:

   ```bash
   gh issue view <número> --json labels
   ```

   - Se `needs-human` estiver presente, **pare aqui** — não implemente.
     Leia o comentário de escalonamento mais recente na Task para saber a
     origem e o que fazer:
     - **"Escalonamento do /spec"** — a spec nunca ficou pronta. Sugira
       resolver o apontado e rodar `/spec` de novo.
     - **"Escalonamento do /execute"** — uma sessão anterior de `/execute`
       já estava implementando e parou porque uma premissa da spec quebrou
       (ver "Procedimento de escalonamento" na Fase 3). Sugira resolver o
       apontado no comentário, remover o label `needs-human`
       (`gh issue edit <número> --remove-label needs-human`) e rodar
       `/execute` de novo — o `## Plano de execução` já registrado leva
       direto de volta ao ponto onde parou.
   - Se nem `spec-ready` nem `sem-spec` estiverem presentes, **pare aqui** —
     a Task ainda não tem spec publicada nem foi marcada como dispensada
     dela. Sugira `/spec <número>` primeiro.
   - Só prossiga se `needs-human` estiver ausente e (`spec-ready` ou
     `sem-spec`) estiver presente.

2. `gh issue view <número>` — leia a issue inteira, já com a spec elaborada
   pelo `/spec` (ou, se `sem-spec`, com o que a skill que a criou deixou).

   **Verifique se o corpo já tem uma seção `## Plano de execução`.** Se
   tiver, isto é uma **retomada** — seja de uma sessão que caiu sem aviso
   (créditos, crash) ou de um escalonamento resolvido pelo humano (item
   anterior, "Escalonamento do /execute": o `needs-human` já foi removido
   ou não teríamos chegado até aqui). Informe quantos itens já estão
   marcados ("Retomando: 3 de 5 itens do plano já feitos.") e **pule a Fase
   2** — vá direto para a Fase 3, continuando do primeiro item não marcado.
   Não pergunte se deve retomar: rodar `/execute` de novo já é o sinal.
   Se não houver essa seção, é sessão nova — siga o fluxo normal.
3. Se precisar de contexto de produto, leia a issue de planejamento (o pai,
   via campo `parent`) no repositório de planejamento. Issue sem `parent`
   nasceu direto neste repositório (`/task`, `/bug`, `/tech-debt`): o
   equivalente está na seção `## Entrada original` do corpo.
4. Leia o `CLAUDE.md` deste repositório.
5. Explore os arquivos citados na seção "Contexto de implementação" da issue,
   se houver (issues `sem-spec` podem não ter essa seção — explore a partir
   do Escopo).
6. Branch: `<número-da-issue>-<slug-curto>`, por exemplo
   `42-convite-por-email`. Confira primeiro se ela já existe (`git branch
   --list`, `git ls-remote --heads`) — numa retomada, existe. Se existir,
   faça checkout nela (`git checkout <branch>`); só crie (`git checkout -b`)
   se for sessão nova.
7. Mova o card da Task no Project de `Ready` para `In progress` via `gh
   project item-edit` — pule este passo numa retomada, o card já está em
   `In progress` desde a primeira sessão.

## Fase 2 — Plano

**Pule esta fase se a Fase 1 detectou retomada** — o plano já está
publicado na Task, é só continuar.

Antes de escrever código, apresente um plano curto no chat: quais arquivos você
vai tocar, em que ordem, e onde vai adicionar teste. Máximo de 10 linhas,
cada uma um passo curto e verificável (ex. "criar migration da tabela
invites", não "mexer no banco"). Isso é informativo — quem estiver
acompanhando vê o que vai acontecer — não um pedido de aprovação. Sem
esperar resposta, grave o plano no corpo da Task issue como checklist, ao
final do corpo atual (o `gh issue edit` substitui o corpo inteiro — sempre
parta do texto já lido na Fase 1, não só do trecho novo), e siga direto
para a Fase 3:

```markdown
## Plano de execução
- [ ] <passo 1>
- [ ] <passo 2>
```

```bash
gh issue edit <número> --body-file <corpo completo com a seção acrescentada>
```

Isso é o que permite retomar depois de uma queda sem aviso ou de um
escalonamento resolvido — ver Fase 1 e o "Procedimento de escalonamento"
na Fase 3.

## Fase 3 — Implementação

Implemente contra os critérios de aceite, um por vez.

Mantenha o branch pequeno e mergeável na `main` **mesmo com a feature
incompleta**. Não segure o PR esperando as outras subtasks da história.

### Progresso

Ao concluir cada item do `## Plano de execução` — não necessariamente a
cada commit, um item pode levar mais de um — marque-o (`- [x]`) e regrave o
corpo via `gh issue edit`, mesmo padrão da Fase 2. É isso que mantém o
checklist confiável se a sessão cair sem aviso: o estado no GitHub nunca
fica mais que um item atrasado em relação ao que foi feito de verdade.

### Procedimento de escalonamento (crítica)

Se durante a implementação você descobrir que uma **premissa da spec caiu** —
a abstração assumida não existe, a abordagem escolhida não funciona, aparece um
caso não previsto, o efeito colateral é maior que o esperado — **pare
imediatamente**.

Não improvise uma solução alternativa. Não "resolva do jeito que der", e
não trave a sessão esperando alguém responder — ninguém precisa estar
olhando. Em vez disso:

1. Pare de escrever código.
2. Marque a Task com o label `needs-human`:

   ```bash
   gh issue edit <número> --add-label needs-human
   ```

3. Comente na Task issue, título **"Escalonamento do /execute"**: o que
   você encontrou, por que a abordagem da spec não funciona, e a
   alternativa que você adotaria se fosse forçado a decidir sozinho — para
   o humano poder só confirmar em vez de escrever do zero.

   ```bash
   gh issue comment <número> --body-file <comentário>
   ```

4. Encerre a sessão. **Não** substitua a abordagem por conta própria. O
   `## Plano de execução` e os commits já feitos ficam como estão — nada é
   desfeito, é exatamente o que permite retomar depois (ver Fase 1).

Depois que o humano resolver (editando a Task issue e/ou respondendo ao
comentário) e remover o label `needs-human`, rodar `/execute <número>` de
novo retoma do ponto exato onde parou.

Uma Task que descreve algo diferente do que foi feito não vale nada. Prefira
interromper cedo.

### Escopo

A seção "Fora de escopo" da Task é vinculante. Se você vir uma melhoria óbvia
em código adjacente e ela não está nos critérios de aceite, **não faça**.
Anote ao final da sessão como sugestão de nova issue.

### Commits

Commit conforme for avançando — por critério de aceite ou por unidade
lógica de mudança, nunca um commit gigante no fim. Toda mensagem segue
Conventional Commits: `<tipo>(<escopo opcional>): <descrição em uma linha,
imperativo, minúscula, sem ponto final>` — ex. `feat(auth): adiciona
convite por e-mail`. Tipos usados neste projeto: `feat`, `fix`, `refactor`,
`test`, `docs`, `chore`, `perf`, `style`, `build`, `ci`. Escolha pelo que o
commit faz — a `Classe` da Task (`mecânica`/`aditiva`/`refatoração`/
`feature`) é uma pista, não uma regra fixa.

## Fase 4 — Verificação

Antes de mais nada, confira `git status` — nenhuma mudança sem commit — e
que todos os itens do `## Plano de execução` estão marcados. Se sobrar
algum, ou a implementação não terminou de verdade, ou o plano ficou
desatualizado em relação ao que foi feito — resolva antes de seguir.

Rode os testes e o lint conforme o `CLAUDE.md`. Depois percorra os critérios de
aceite um a um e diga, para cada um, como você verificou. Se algum não puder ser
verificado, diga isso explicitamente — não marque como feito.

## Fase 5 — PR

```bash
gh pr create \
  --title "<tipo>(<escopo opcional>): <descrição curta>" \
  --body "Closes #<número>

<se a Task tiver um pai na issue de planejamento: 'Parte de <ORG>/<planning-repo>#<número-do-pai>'>

<resumo em 3-5 linhas do que mudou e por quê>"
```

O título do PR segue o mesmo formato Conventional Commits dos commits da
Fase 3 (seção "Commits", acima) — importa porque em squash-merge o GitHub
usa o título do PR como a mensagem final do commit em `main`. Se a Task
produziu commits de mais de um tipo, use no título o mais significativo:
`feat` > `fix` > `refactor` > demais.

A linha `Closes #<número>` é obrigatória — é ela que fecha a Task issue no
merge. A linha "Parte de..." é opcional mas recomendada quando a Task tem uma
issue de planejamento como pai — GitHub linka automaticamente issues
cross-repo mencionadas assim, preservando a rastreabilidade até a story
original sem precisar de nenhuma chave manual.

Depois de abrir o PR, mova o card da Task no Project de `In progress` para
`In review` via `gh project item-edit`, mesmo padrão do passo anterior.

Ao final, informe: link do PR, o que ficou fora de escopo, e qualquer sugestão
de issue nova que tenha surgido.
