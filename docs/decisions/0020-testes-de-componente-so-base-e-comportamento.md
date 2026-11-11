# 0020 – Testes de componente do Backoffice: axe só na base, sem medida de layout

- Status: aceito (substitui em parte o 0017 e o 0019: o "layout por largura" e o axe por tela
  nos testes de componente)
- Data: 2026-11-11

## Contexto

Com o 0019, os testes de componente em Chromium (`test:browser`) ficaram com tudo o que saiu do
E2E: axe, teclado, foco, tema e layout por largura. Eram 291 testes em 69 arquivos, cerca de
75 s no job `quality`, em todo PR. 149 eram de axe, quase todos repetidos nos dois temas, e
cerca de 55 mediam layout em pixels (rolagem horizontal, linhas por célula, posição a 390,
1280 e 1440 px).

Nos runs do `ci.yml` entre 31/10 e 11/11/2026, a etapa falhou 11 vezes:

- 5 no Upload: o Enter não abria o seletor de arquivos nativo no runner (instabilidade, já com
  três tentativas);
- 5 na lista de conteúdos a 390 px (medida de layout quebrada por mudança de tela);
- 1 no axe do TimeInput.

## Decisão

1. **Axe, foco e tema ficam nos componentes de base:** `ui/`, `shared/`, `template/`,
   `layouts/` e a moldura `(admin)/layout`, nos dois temas. É a verificação de WCAG 2.2 AA do
   Backoffice no CI.
2. **Composição de domínio** (`contents/`, `sites/`, `generation/`, `audience/`, `media/`,
   `forms/`, `editorial/`, `review/`, `releases/`) só ganha teste em Chromium para
   comportamento que precisa do navegador: teclado, foco preso e devolvido, estado na URL,
   envio de formulário. Sem axe e sem repetir por tema. Sem esse comportamento, não tem
   arquivo `*.browser.test.tsx`.
3. **Sem medida de layout:** nada de rolagem horizontal, linhas por célula, posição, largura
   ou altura em pixels por largura de janela. Continuam o contorno de foco de 2px e o alvo de
   24 px (critérios da WCAG), na base.
4. **Sem seletor de arquivos nativo:** arquivo entra por `userEvent.upload` no `<input>`. O
   comando `pressAndChooseFiles` sai.

Resultado: 166 testes em 52 arquivos.

## Alternativas consideradas

- Manter o axe em todo componente: a cobertura de WCAG não mudaria, e a suíte ficaria em ~235
  testes, com cada tela nova somando dois de axe.
- Axe em um tema só: o contraste do tema escuro deixaria de ser verificado, inclusive na base.
- Tirar o axe todo: o Backoffice ficaria sem nenhuma verificação automática de WCAG.

## Consequências

- Violação de axe que só aparece na composição (ordem de títulos, rótulo de uma tabela, cor
  aplicada por classe da própria tela) deixa de ser pega pelo CI; fica com a revisão.
- Regressão de layout (tabela que passa da janela, coluna que não some no celular, título
  cortado) não é mais pega por teste nenhum.
- Abrir o seletor de arquivos pelo teclado (Enter e Espaço no Upload) não é mais conferido.
- Tela nova de domínio, em geral, não ganha teste em Chromium: ganha teste de lógica
  (`*.test.tsx`) e, se tiver interação de teclado ou foco própria, um `*.browser.test.tsx` só
  disso.
