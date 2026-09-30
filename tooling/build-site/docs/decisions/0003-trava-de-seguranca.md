# 0003 – Trava de segurança no render, com os dados do build-runner

- Status: aceito
- Data: 2026-09-30

- O `build-runner` passa `ACTIVE_PAGE_COUNT` (páginas da versão ativa; ausente no primeiro build), `PAGE_DROP_TOLERANCE` (0–1, padrão 0,2) e `ALLOW_MASS_UNPUBLISH` (despublicação em massa declarada).
- Depois do build, o render conta as páginas (HTML sem a 404). Se `pages < ativa × (1 − tolerância)`, falha como **permanente**, com os dois números e o percentual na mensagem.
- A regra é `checkPageDrop` (`src/render/page-drop.ts`), com testes nas bordas.
