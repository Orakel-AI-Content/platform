# Testes do Backoffice

Complementa `docs/conventions/testing.md` da raiz só com o que é desta unidade.

| Tarefa          | Configuração                | Precisa                            |
| --------------- | --------------------------- | ---------------------------------- |
| `test`          | `vitest.config.ts`          | nada                               |
| `test:browser`  | `vitest.browser.config.ts`  | Chromium do Playwright             |
| `test:contract` | `vitest.contract.config.ts` | `DATABASE_URL` (Postgres limpo)    |
| `test:e2e`      | `playwright.config.ts`      | `pnpm local:up && pnpm local:seed` |

E2E de telas (#474): `pnpm exec playwright test --project=telas`, nesta pasta, com um Postgres
na `DATABASE_URL` (ou `E2E_DATABASE_URL`). Precisa só do Chromium do Playwright.

- **Unitários** ao lado do código; o domínio é testado sem banco quando a regra é pura
  (RBAC, mapeamentos) e pela suíte de contrato quando depende de transação.
- **Componente em Chromium** (`src/**/*.browser.test.tsx`, ao lado do componente; #457): teclado,
  foco, axe, tema e movimento no navegador de verdade, com o CSS de `globals.css`, sem servidor
  nem banco. É onde ficam os testes de acessibilidade de um componente (antes na vitrine do E2E).
  Render com `renderUi` (`test/browser/render.tsx`, com o `MotionProvider` do layout) ou, para
  Dialog, Drawer, ConfirmDialog e toast, `renderInApp` (o corpo do layout: `#app-root` com o
  `appElement` do react-modal e o `ToastProvider` fora dele; #458), com `appRoot`,
  `expectFocusTrapped` e `appElementWarnings` de `test/browser/dialog.ts`. O store do toast é do
  módulo: quem usa toast chama `toast.removeAll()` no `afterEach`. Helpers em
  `test/browser/a11y.ts`: `audit` (axe WCAG 2.2 AA; `auditWithout` desliga uma regra decidida caso
  a caso), `setTheme` (classe `dark` e mídia emulada),
  `setReducedMotion`, `tabTo`, `outline`, `focusRing` e `targetSize`. Tema e movimento pela mídia
  emulada do Playwright (comandos em `test/browser/commands.ts`), nunca mock de `matchMedia`.
  Largura de tela por `page.viewport` (o setup volta a 1280 × 720 depois de cada teste). Quem
  usa o roteador do Next mocka `next/navigation` com o roteador em memória
  (`vi.mock('next/navigation', () => import('<…>/test/browser/navigation.ts'))`; a URL fica em
  `navigation`). O navegador fica no fuso de São Paulo; `commands.emulateTimezone('UTC')` troca
  durante um teste (#459). Instale o Chromium uma vez:
  `pnpm --filter @orakel/backoffice exec playwright install chromium`.
- **Contrato** (`test/contract/`): cada arquivo migra e limpa o banco (`helpers.ts`);
  rodam um arquivo por vez. Antes de migrar, a suíte recusa um banco com sites que ela não
  marcou (tabela `contract_suite`, fora das migrations): apontada para o banco do
  `local:up`, ela apagaria o seed. Use o Postgres descartável abaixo. O snapshot de cada fixture do `content-model` tem de passar no
  `validateSnapshot` e reproduzir a fixture, menos as mudanças pendentes do header.
- **Volume no contrato** (#461): as listas grandes (`listContents`, `listMediaPage` com busca e
  página 2) são medidas com 2.000 linhas por site, numa rede de 5 sites, no banco descartável.
  As sementes ficam em `test/volume.ts` (`createVolumeSite`, `seedContents`, `seedMedia`, que
  rodam o `analyzeTables` no fim, antes de qualquer `EXPLAIN`); `profileQueries`
  (`test/contract/helpers.ts`) roda a leitura, mede o tempo e devolve as tabelas lidas por
  `Seq Scan` no `EXPLAIN (FORMAT JSON)` de cada consulta. O critério é o plano sem `Seq Scan`
  nas tabelas grandes; o teto de 300 ms só pega regressão grosseira. Com um site só, o
  `Seq Scan` é o plano certo (lê a tabela inteira) e não diria nada: por isso os vizinhos. A
  busca sem acento e o filtro das listas no cliente têm o caso de 2.000 itens no unitário de
  `useListState`.
- **E2E** (`test/e2e/`): telas de sites, o editor de conteúdo e axe (WCAG 2.2 AA), em duas
  camadas (#474). O padrão do `playwright.config.ts` é o projeto `telas`: o próprio Playwright
  sobe o Next (`next start` com `CI`, `next dev` fora dele, porta `E2E_TELAS_PORT`, 3100 por
  padrão) e um access-mock (`E2E_ACCESS_PORT`, 8790). O `globalSetup` migra o banco e semeia os
  usuários de teste e `exemplo-a`/`exemplo-b`. Não há Caddy, S3, worker nem build-runner; no CI,
  é o job `e2e-telas` do `ci.yml`. O teste que só a pilha prova (sessão do Access pelo Caddy,
  S3 e worker, build, pré-visualização) leva `{ tag: '@stack' }` e fica fora do `telas`. Com
  `E2E_STACK=1` (o `test:e2e` e o `local:e2e:area` já passam), a suíte inteira roda no projeto
  `chromium`, contra a pilha: por padrão, a imagem `backoffice:local` do compose. A sessão vem
  de `asRole(page, papel)` (`test/e2e/auth.ts`): o JWT da rota de token do access-mock, no
  header `cf-access-jwt-assertion` e no cookie `CF_Authorization`, valendo para as duas
  camadas. Login pela tela do mock só nos testes da sessão do Access. Numa sessão,
  rode contra o par isolado do worktree (`pnpm local:isolated up <id>`, na raiz): ele imprime
  `E2E_BASE_URL` e `E2E_DATABASE_URL`, e o `playwright.config.ts` usa esse banco no lugar da
  `DATABASE_URL` nos specs e na limpeza. O par não tem worker nem build-runner: o que depende de
  build roda no CI ou no ambiente compartilhado. Numa sessão, rode só a área tocada:
  `pnpm local:e2e:area <arquivo sem .spec.ts>` (ou `smoke`), na raiz. Jornada principal de uma
  área nova leva `{ tag: '@smoke' }`. Localmente, nenhum spec semeia lista com mais de 100 itens: o
  que precisa de uma lista com mais de uma página usa um site pequeno (`test/volume.ts`).
- **Projeto `perf`** (`playwright.config.ts`, #461): o teste que semeia 2.000 linhas e mede
  tempo no navegador leva `{ tag: '@perf' }`, um por bloco ("abre e busca em menos de 2 s"). O
  `telas` e o `chromium` excluem `@perf`; o `perf` só tem `@perf` e só existe na pilha, com `CI`
  (o `e2e.yml`) ou `E2E_PERF=1`, porque fora do CI o tempo depende da carga da máquina, não do
  código. O `local:e2e:area` passa arquivos ao Playwright e não pega o `perf`. Conferir:
  `E2E_STACK=1 pnpm exec playwright test --list` não lista `@perf`; com `CI=1`, lista os do
  `[perf]`.
- **Sites do E2E**: quem cadastra site (`e2e-<timestamp>`) registra o ID e o remove do banco
  no `afterAll` com `removeSites` (`test/e2e/cleanup.ts`), junto com o build agendado.

## Postgres para o contrato, na máquina

```sh
docker run -d --rm --name pg-contrato -e POSTGRES_USER=orakel -e POSTGRES_PASSWORD=orakel-ci \
  -e POSTGRES_DB=orakel -p 127.0.0.1:55432:5432 postgres:18.6-alpine
DATABASE_URL=postgres://orakel:orakel-ci@127.0.0.1:55432/orakel pnpm test:contract
```
