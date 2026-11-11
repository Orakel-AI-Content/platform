import type { Locator } from 'vitest/browser';

// Medidas de layout dos testes de componente (#460), as que o E2E fazia tela a tela: linhas de
// texto por célula de tabela (#117) e rolagem horizontal da página e do contêiner da Table.

type Target = Element | Locator;

const toElement = (target: Target): Element =>
  target instanceof Element ? target : target.element();

export type CellLines = { row: string; column: number; lines: number };

/**
 * Linhas de texto de cada célula do corpo da tabela, não altura em px (#117): um badge ou botão
 * 1 px maior não muda a contagem. Só nós de texto visíveis (a Range da célula inteira traria as
 * caixas dos badges, alguns px acima do texto); o texto sr-only mede 1 px e fica de fora.
 * Retângulos que se sobrepõem na vertical são a mesma linha: badge e texto ao lado não têm o
 * mesmo top. `row` é o começo do texto da linha, para a falha dizer onde.
 */
export function cellLines(table: Target): CellLines[] {
  return [...toElement(table).querySelectorAll('tbody tr')].flatMap((tr) => {
    const row = tr.textContent?.trim().slice(0, 60) ?? '';
    return Array.from(tr.querySelectorAll('td'), (cell, column) => {
      const lines: { top: number; bottom: number }[] = [];
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (rect.width <= 1 || rect.height <= 1) continue;
          const middle = (rect.top + rect.bottom) / 2;
          const line = lines.find((l) => l.top <= middle && middle <= l.bottom);
          if (line === undefined) lines.push({ top: rect.top, bottom: rect.bottom });
          else
            Object.assign(line, {
              top: Math.min(line.top, rect.top),
              bottom: Math.max(line.bottom, rect.bottom),
            });
        }
      }
      return { row, column, lines: lines.length };
    });
  });
}

/** As células com mais de `max` linhas de texto (vazio quando a tabela é legível de relance). */
export function cellsOverLines(table: Target, max = 2): CellLines[] {
  const cells = cellLines(table);
  if (cells.length === 0) throw new Error('A tabela não tem células no corpo');
  return cells.filter((cell) => cell.lines > max);
}

/** Quanto a página rola na horizontal (0 quando cabe na janela). */
export function pageOverflow(): number {
  return document.documentElement.scrollWidth - document.documentElement.clientWidth;
}

/** Quanto o contêiner da tabela (o `overflow-x-auto` da Table) rola na horizontal. */
export function tableOverflow(table: Target): number {
  const container = toElement(table).parentElement!;
  return container.scrollWidth - container.clientWidth;
}

/**
 * Se o texto foi cortado (o `truncate` escondeu parte dele): a largura do texto inteiro passa da
 * caixa. Em px fracionários, pela Range: `scrollWidth` e `clientWidth` arredondam, e um texto de
 * 99,6 px numa caixa do mesmo tamanho daria 1 px de "corte". Só o texto visível conta: o de um
 * `.sr-only` (ex.: "(abre em nova aba)") transborda da caixa de 1 px dele sem aparecer.
 */
export function isClipped(target: Target): boolean {
  const element = toElement(target);
  const range = document.createRange();
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let left = Infinity;
  let right = -Infinity;
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node.parentElement?.closest('.sr-only')) continue;
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0) continue;
    left = Math.min(left, rect.left);
    right = Math.max(right, rect.right);
  }
  if (right < left) return false;
  return right - left > element.getBoundingClientRect().width + 0.5;
}

/** Linhas de texto de cada célula de uma coluna, achada pelo texto do cabeçalho (#585). */
export function columnLines(table: Target, header: string): number[] {
  const element = toElement(table);
  const column = Array.from(element.querySelectorAll('thead th'), (th) =>
    th.textContent?.trim(),
  ).indexOf(header);
  if (column === -1) throw new Error(`A tabela não tem a coluna ${header}`);
  return cellLines(element)
    .filter((cell) => cell.column === column)
    .map((cell) => cell.lines);
}

/**
 * Texto dos cabeçalhos das colunas que aparecem (#589): fica de fora a coluna com `hideBelow`
 * oculta pelo `hidden md:table-cell` do DataTable na largura atual.
 */
export function visibleColumns(table: Target): string[] {
  return Array.from(toElement(table).querySelectorAll('thead th'))
    .filter((th) => getComputedStyle(th).display !== 'none')
    .map((th) => th.textContent?.trim() ?? '');
}
