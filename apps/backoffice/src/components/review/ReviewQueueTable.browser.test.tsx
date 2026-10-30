import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';

import type { ReviewQueueItem } from '@/domain/content/contents.ts';

import { audit, COLOR_SCHEMES, setReducedMotion, setTheme } from '../../../test/browser/a11y.ts';
import { cellsOverLines, pageOverflow, tableOverflow } from '../../../test/browser/layout.ts';
import { navigation } from '../../../test/browser/navigation.ts';
import { ListScreen, renderInFrame } from '../../../test/browser/render.tsx';
import { ReviewQueueTable } from './ReviewQueueTable.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// Fila de revisão em Chromium (#460; antes no E2E, `revisao.spec.ts`, #276, #365): a 1280 px, na
// moldura do admin, nada rola na horizontal e nenhuma célula passa de duas linhas de texto, com
// um título longo; o axe roda nos dois temas.

const SITE = 'exemplo-a';

const ROWS: ReviewQueueItem[] = Array.from({ length: 12 }, (_, index) => ({
  id: 2000 + index,
  kind: index % 2 === 0 ? 'article' : 'page',
  title:
    index === 0
      ? 'Artigo e2e-fila-light-1761000000000 com um título longo para a fila de revisão'
      : `Artigo ${index + 1}`,
  version: index + 1,
  updatedAt: new Date('2026-10-20T12:00Z'),
}));

function Queue() {
  return (
    <ListScreen title="Revisão">
      <ReviewQueueTable
        siteId={SITE}
        timeZone="America/Sao_Paulo"
        rows={ROWS}
        labelledBy="lista-titulo"
      />
    </ListScreen>
  );
}

const table = () => page.getByRole('table', { name: 'Revisão', exact: true });

beforeEach(() => {
  navigation.set(`/sites/${SITE}/revisao`);
});

afterEach(() => {
  navigation.set('/');
});

describe('ReviewQueueTable no navegador', () => {
  it('a 1280 px, sem rolagem horizontal e com até duas linhas por célula', async () => {
    await renderInFrame(<Queue />, { roles: ['revisor'] });
    await expect.element(table().getByRole('row', { name: /título longo/ })).toBeVisible();

    expect(pageOverflow()).toBe(0);
    expect(tableOverflow(table())).toBe(0);
    expect(cellsOverLines(table())).toEqual([]);
  });

  it.each(COLOR_SCHEMES)('sem violação do axe (%s)', async (scheme) => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    await renderInFrame(<Queue />, { roles: ['revisor'] });
    expect(await audit()).toEqual([]);
  });
});
