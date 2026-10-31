import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';

import type { PendingChange } from '@/domain/pending-changes/list.ts';

import { audit, COLOR_SCHEMES, setReducedMotion, setTheme } from '../../../test/browser/a11y.ts';
import { cellsOverLines, pageOverflow, tableOverflow } from '../../../test/browser/layout.ts';
import { navigation } from '../../../test/browser/navigation.ts';
import { ListScreen, renderInFrame } from '../../../test/browser/render.tsx';
import { PendingChangesTable } from './PendingChangesTable.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// Mudanças pendentes em Chromium (#460; antes no E2E, `sites.spec.ts`, #249, #365): a 1280 px,
// na moldura do admin, nada rola na horizontal e nenhuma célula passa de duas linhas, com uma
// pendência de cada origem; o axe roda nos dois temas.

const SITE = 'exemplo-a';

const ROWS: PendingChange[] = [
  { id: 1, origin: 'config', reference: 'v12', createdAt: new Date('2026-10-20T12:00Z') },
  { id: 2, origin: 'content', reference: '1042', createdAt: new Date('2026-10-20T13:00Z') },
  { id: 3, origin: 'author', reference: '7', createdAt: new Date('2026-10-20T14:00Z') },
  { id: 4, origin: 'taxonomy', reference: '15', createdAt: new Date('2026-10-20T15:00Z') },
  { id: 5, origin: 'menu', reference: '3', createdAt: new Date('2026-10-20T16:00Z') },
];

function Pending() {
  return (
    <ListScreen title="Mudanças pendentes">
      <PendingChangesTable
        siteId={SITE}
        timeZone="America/Sao_Paulo"
        rows={ROWS}
        labelledBy="lista-titulo"
      />
    </ListScreen>
  );
}

const table = () => page.getByRole('table', { name: 'Mudanças pendentes', exact: true });

beforeEach(() => {
  navigation.set(`/sites/${SITE}/pendencias`);
});

afterEach(() => {
  navigation.set('/');
});

describe('PendingChangesTable no navegador', () => {
  it('a 1280 px, sem rolagem horizontal e com até duas linhas por célula', async () => {
    await renderInFrame(<Pending />, { roles: ['operacao'] });
    await expect
      .element(table().getByRole('link', { name: 'Configuração v12 (abrir)' }))
      .toHaveAttribute('href', `/sites/${SITE}/configuracao`);

    expect(pageOverflow()).toBe(0);
    expect(tableOverflow(table())).toBe(0);
    expect(cellsOverLines(table())).toEqual([]);
  });

  it.each(COLOR_SCHEMES)('sem violação do axe (%s)', async (scheme) => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    await renderInFrame(<Pending />, { roles: ['operacao'] });
    expect(await audit()).toEqual([]);
  });
});
