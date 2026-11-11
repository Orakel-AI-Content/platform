# 0019 – E2E do Backoffice só com fluxos críticos

- Status: aceito (substitui em parte o 0016 e o 0017: o que o E2E cobre, o axe no E2E e o
  projeto `perf`; as três camadas, os gatilhos e a trava do release continuam)
- Data: 2026-11-11

## Contexto

O E2E do Backoffice cresceu com cada tela portada: 87 testes em 16 specs (4.000 linhas), 76 na
camada `telas`, que roda em todo PR. A regra era um teste de axe por tela e asserções de
layout, trilha, título da aba, tema e estado na URL junto dos fluxos.

Nos 176 runs concluídos do `ci.yml` entre 31/10 e 11/11/2026:

- o job `e2e-telas` falhou 26 vezes: 11 no `next build` (erro de código) e 15 em testes;
- as 15 foram asserções de texto, contagem, layout e axe quebradas por mudança de tela, não
  instabilidade. Só "editor sem violação do axe" falhou em 6 jobs;
- o job levava 4,7 min em média, 3 min só de testes.

No `e2e.yml` (pilha, fora do PR), 7 de 43 runs na main e no noturno falharam, com "login pelo
Access" e "Sair pelo teclado" entre os instáveis.

O que esses testes conferiam já tem camada mais barata: os testes de componente em Chromium
(`test:browser`) cobrem teclado, foco, axe, tema e layout por largura, e o contrato mede as
consultas com volume.

## Decisão

1. **O E2E do Backoffice cobre só fluxos críticos:** o que o produto não pode deixar de fazer e
   que só o app inteiro prova (gravação pela tela, permissão por papel, publicação). São 10
   testes na camada `telas` e 4 na pilha (`@stack`):
   - `telas`: criar artigo com texto, imagem e FAQ; revisor sem edição; despublicar com 301;
     criar autor e categoria e usá-los; enviar para revisão; devolver ao editor; cadastrar e
     editar site; publicar site; editor sem configuração; 404.
   - `@stack`: login pelo Access; API de exportação fora do hostname público; gerar → aprovar →
     publicar → artigo no site; foto com GPS → variantes sem EXIF → artigo publicado.
2. **Tela nova não ganha E2E.** Ganha teste de componente. Só um fluxo crítico novo entra no
   E2E, e no teste de fluxo não vão asserções de aparência (classe, tamanho, posição, título da
   aba, ordem de colunas).
3. **O axe sai do E2E do Backoffice.** A meta WCAG 2.2 AA continua, verificada nos testes de
   componente (`audit` de `test/browser/a11y.ts`) e, nos sites públicos, no `test:a11y`.
4. **O projeto `perf` e os testes `@perf` saem.** O tempo no navegador com 2.000 linhas dependia
   da carga do runner; a consulta com volume continua medida no contrato.

## Alternativas consideradas

- Tirar a camada `telas` do PR e rodá-la só na main: a quebra de um fluxo crítico só apareceria
  depois do merge. Com 10 testes, o custo no PR é pequeno.
- Remover a camada `telas` inteira: nenhum fluxo de gravação seria conferido antes do merge.
- Manter um teste de axe por tela: era a maior fonte individual de falha, e repete o que os
  testes de componente já auditam.
- Manter o job e torná-lo não bloqueante: um job que pode falhar deixa de ser lido.

## Consequências

- Regressão de aparência ou de acessibilidade na composição de uma tela inteira (não num
  componente) deixa de ser pega pelo CI; fica com a revisão e com os testes de componente.
- Estado na URL, trilha, título da aba, primeira pintura do tema e telas de erro e de
  carregamento não têm mais E2E.
- As páginas `/teste-de-componentes` e `/teste-de-erro` continuam no app (com
  `E2E_ERROR_ROUTE`), sem spec que as visite.
- Os guias de porte do Ecme deixam de pedir E2E e axe por tela.
