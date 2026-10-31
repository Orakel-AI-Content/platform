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
