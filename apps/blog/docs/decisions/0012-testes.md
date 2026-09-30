# 0012 – Sites de exemplo: axe, paridade e idempotência

- Status: aceito
- Data: 2026-09-30

- `pnpm build:examples` constrói `exemplo-a` e `exemplo-b` (fixtures) **duas vezes** cada e compara o hash de todos os arquivos (idempotência), e depois o SSR, em `dist-examples/`.
- `test:a11y`: axe (WCAG 2.0/2.1/2.2 A e AA) nas páginas de cada tipo dos dois sites, em 375 e 1280 px; mídia e `/_e/*` bloqueados.
- `test:parity`: o mesmo artigo, listagem e home no estático e no SSR; o HTML é normalizado (hash dos assets, prefixo `/<site>`, script de eventos e link do RSS, espaços) e comparado.
- Vitest para a lógica do app: rotas, links, sumário, datas, fontes de dados, orçamento, env, Consent Mode, idempotência.
