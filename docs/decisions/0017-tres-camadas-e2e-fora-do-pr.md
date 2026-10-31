# 0017 – Três camadas de teste do Backoffice, PR sem Docker e pilha completa fora do PR

- Status: aceito (substitui o item 3 da Decisão do 0016, "Suíte completa, no CI")
- Data: 2026-10-31

## Contexto

Com o 0016, o `e2e.yml` rodava a suíte inteira em todo PR do Backoffice, em 2 shards. Nos runs
medidos, os testes levavam 1,5–3,5 min por shard, e 70–80% do tempo era subir infraestrutura:
bake das imagens, `--load`, `local:up`, seed com a mídia do S3 e download do Chromium. Um PR
levava ~10 min no caso bom e 20–40 min no ruim.

Localmente, o E2E de uma área custava 10–20 min: `next build` a cada mudança (o cache do turbo
invalida a cada edição), cópia do banco compartilhado por `pg_dump | psql` e um Caddy avulso
(`pnpm local:isolated`). A cópia não usava `CREATE DATABASE … TEMPLATE` porque o banco
compartilhado sempre tem conexões (backoffice-web, worker, build-runner), e o TEMPLATE exige a
origem sem nenhuma.

Dos ~106 testes, só 8 precisam da pilha inteira (Caddy com forward_auth, S3 e worker,
build-runner, edge-local, pré-visualização). O resto precisa só de Next, Postgres e um JWT
válido: o app lê a identidade só do header `cf-access-jwt-assertion`.

## Decisão

Três camadas, da mais barata para a mais cara:

1. **Componente (Vitest Browser Mode):** teclado, foco, menus, drawer, tema, layout por largura
   e axe de componente (`test:browser`), sem servidor nem banco.
2. **Telas (Playwright, projeto `telas`):** rotas, RBAC visível, formulários e gravação, estado
   na URL, HTML do servidor e axe da tela com dados reais, contra o Next, o Postgres e um
   access-mock próprio, sem Caddy, S3, worker, build-runner, edge-local nem imagem Docker. O
   login é a fixture `asRole` (JWT da rota de token do access-mock no header e no cookie), e o
   `globalSetup` migra e semeia o banco (usuários de teste, `exemplo-a` e `exemplo-b`).
   - **No PR:** o job `e2e-telas` do `ci.yml`, com `next start` (`.next` do cache do turbo) e
     o Postgres de serviço do runner (#474).
   - **Local, opcional:** `pnpm local:e2e:telas <área>` (#477), com `next dev` e access-mock
     no host e só o Postgres do compose. Ocupa uma das `E2E_SLOTS` vagas da máquina; a vaga N
     tem o banco `orakel_e2e_N` e as portas 3100+N (Next) e 8790+N (access-mock). O banco da
     vaga é cópia por `CREATE DATABASE … TEMPLATE orakel_e2e_template`: um banco próprio,
     semeado pelo mesmo `globalSetup` e depois fechado para conexões. A impressão das
     migrações, das fixtures, dos domínios locais e do `globalSetup` fica no
     `COMMENT ON DATABASE` do template; impressão diferente o recria, sob uma trava própria.
     Na saída (sucesso, falha ou Ctrl+C), o banco da vaga é apagado.
3. **Pilha completa (projeto `stack`, testes `@stack`, e o `perf`):** o `e2e.yml` (#475),
   contra o ambiente local em containers, fora do caminho do PR: em todo push na main que
   afeta o Backoffice, toda noite, em PR com o label `e2e:completo` e manual. Falha na main ou
   no noturno abre (ou comenta) a issue `e2e-completo-quebrado`, e o `release.yml` exige o
   último run da main verde.

**Definição de pronto de uma tarefa:** `lint`, `typecheck`, `test`, `test:browser` e, se tocar
o domínio, `test:contract`. O E2E de telas local é opcional; o de pilha não roda na sessão.

O `pnpm local:isolated` (Backoffice com `next build`, banco copiado e Caddy por sessão) vira
legado e sai depois de 2 semanas sem uso. O `pnpm local:e2e:area` (a suíte contra a pilha
local, `E2E_STACK=1`) continua até a mudança do `e2e.sh`.

## Alternativas consideradas

- Manter a suíte completa em todo PR (0016): o PR continuaria pagando a infraestrutura em
  cada mudança por 8 testes que só a pilha prova.
- Template a partir do banco compartilhado `orakel`: o TEMPLATE exige a origem sem conexões, e
  o compartilhado sempre tem.
- Semear o template por `pg_dump` do compartilhado ou pelo `local:seed`: o conteúdo seria o
  do ambiente local (com a mídia do S3), não o mesmo do job `e2e-telas`.
- Recriar o template a cada execução: devolveria o custo do seed, que a cópia por TEMPLATE
  evita.
- Uma flag no `e2e.sh` em vez de um script próprio: as duas camadas terão destinos
  diferentes; a trava de vagas e a validação de área ficam no `infra/local/lib.sh`.
- Template por branch ou por worktree: um só por máquina basta, recriado quando a impressão
  muda.

## Consequências

- O PR do Backoffice deixa de subir Docker; regressão só de integração (Caddy, build-runner)
  aparece depois do merge, no run da main, que trava o release e abre a issue.
- O `next dev` local difere do `next start` do CI; a diferença só afeta o atalho local. Com
  `next dev`, teste que digita ou usa o teclado espera `networkidle`.
- Uma execução do `local:e2e:telas` por worktree: o `next dev` trava o `.next/dev`, e a
  segunda sai com "Another next dev server is already running". Sessões em worktrees
  diferentes rodam juntas, uma por vaga.
- Duas sessões que mudam migrações ou fixtures de forma diferente recriam o template uma da
  outra; cada recriação custa um seed.
