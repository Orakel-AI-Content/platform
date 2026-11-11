// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { SiteInstance } from '@/domain/sites/sites.ts';

import { SiteBuildsTable } from './SiteBuildsTable.tsx';

// Aba "Builds" da página do site (#595): os últimos builds na `Table` do Ecme, com Status, Data
// (no fuso do site), Release e Versão, e o estado vazio. Axe no navegador, em
// `SiteBuildsTable.browser.test.tsx`.

const BUILDS: SiteInstance['recentBuilds'] = [
  {
    id: 2,
    status: 'failed',
    versionId: null,
    finishedAt: new Date('2026-10-11T12:00:00Z'),
    release: '1.3.0',
  },
  {
    id: 1,
    status: 'ok',
    versionId: '20261010T120000Z-bbbbbbbb',
    finishedAt: new Date('2026-10-10T12:00:00Z'),
    release: '1.2.0',
  },
];

afterEach(cleanup);

describe('SiteBuildsTable', () => {
  it('uma linha por build, do mais novo ao mais antigo, com as quatro colunas', () => {
    render(<SiteBuildsTable builds={BUILDS} timeZone="America/Sao_Paulo" />);

    const table = screen.getByRole('table', { name: 'Últimos builds' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Status', 'Data', 'Release', 'Versão']);
    const rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((cell) => cell.textContent),
      );
    expect(rows).toEqual([
      ['Falhou', '11/10/2026, 09:00 BRT', '1.3.0', '—'],
      ['Publicado', '10/10/2026, 09:00 BRT', '1.2.0', '20261010T120000Z-bbbbbbbb'],
    ]);
  });

  it('sem builds, o estado vazio no lugar da tabela', () => {
    render(<SiteBuildsTable builds={[]} timeZone="America/Sao_Paulo" />);

    expect(screen.getByText('Nenhum build ainda.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
