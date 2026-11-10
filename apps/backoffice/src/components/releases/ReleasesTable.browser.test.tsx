import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';

import type { ReleaseRecord } from '@/domain/releases/releases.ts';

import { audit, COLOR_SCHEMES, setReducedMotion, setTheme } from '../../../test/browser/a11y.ts';
import { cellsOverLines, pageOverflow, tableOverflow } from '../../../test/browser/layout.ts';
import { navigation } from '../../../test/browser/navigation.ts';
import { ListScreen, renderInFrame } from '../../../test/browser/render.tsx';
import { ReleasesTable } from './ReleasesTable.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// Registro de releases em Chromium (#509): a 1280 px, na moldura do admin, nada rola na
// horizontal e nenhuma célula passa de duas linhas; o axe roda nos dois temas.

const ROWS: ReleaseRecord[] = [
  { tag: '1.10.0', registeredAt: new Date('2026-11-02T15:00Z') },
  { tag: '1.9.0', registeredAt: new Date('2026-10-20T12:30Z') },
  { tag: '0.1.0', registeredAt: new Date('2026-09-01T09:00Z') },
];

function Releases() {
  return (
    <ListScreen title="Releases">
      <ReleasesTable rows={ROWS} labelledBy="lista-titulo" />
    </ListScreen>
  );
}

const table = () => page.getByRole('table', { name: 'Releases', exact: true });

beforeEach(() => {
  navigation.set('/releases');
});

afterEach(() => {
  navigation.set('/');
});

describe('ReleasesTable no navegador', () => {
  it('a 1280 px, sem rolagem horizontal e com até duas linhas por célula', async () => {
    await renderInFrame(<Releases />, { roles: ['operacao'] });
    await expect.element(table().getByText('1.10.0')).toBeVisible();

    expect(pageOverflow()).toBe(0);
    expect(tableOverflow(table())).toBe(0);
    expect(cellsOverLines(table())).toEqual([]);
  });

  it.each(COLOR_SCHEMES)('sem violação do axe (%s)', async (scheme) => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    await renderInFrame(<Releases />, { roles: ['operacao'] });
    expect(await audit()).toEqual([]);
  });
});
