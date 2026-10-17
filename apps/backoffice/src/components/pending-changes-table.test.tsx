// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { PendingChange } from '@/domain/pending-changes/list.ts';
import type { PendingOrigin } from '@/domain/pending-changes/record.ts';

import { PendingChangesTable } from './pending-changes-table.tsx';

// Tela de pendências (#99): origem legível, item com link quando há tela e data no fuso do
// site; sem pendências, o estado vazio.

afterEach(cleanup);

const createdAt = new Date('2026-10-01T12:00:00Z');
const change = (id: number, origin: PendingOrigin, reference: string): PendingChange => ({
  id,
  origin,
  reference,
  createdAt,
});

const rows: PendingChange[] = [
  change(9, 'config', 'v3'),
  change(8, 'content', '42'),
  change(7, 'author', '5'),
  change(6, 'taxonomy', '2'),
  change(5, 'menu', '1'),
  change(4, 'media', '11'),
  change(3, 'redirect', '7'),
  change(2, 'release', '2026.10.1'),
  change(1, 'platform', 'tokens'),
];

const renderTable = (data = rows) =>
  render(<PendingChangesTable siteId="exemplo-a" timeZone="America/Sao_Paulo" rows={data} />);

describe('tabela de mudanças pendentes', () => {
  it('mostra a origem legível de cada uma das 9 origens', () => {
    renderTable();

    const origins = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.firstChild?.textContent);
    expect(origins).toEqual([
      'Configuração',
      'Conteúdo',
      'Autor',
      'Taxonomia',
      'Menu',
      'Mídia',
      'Redirecionamento',
      'Release',
      'Plataforma',
    ]);
    expect(screen.getByText('9 mudanças pendentes')).toBeTruthy();
  });

  it('cabeçalho de coluna em cada coluna e a contagem na legenda', () => {
    renderTable([change(1, 'content', '42')]);

    const headers = screen.getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual([
      'Origem',
      'Item',
      'Registrada em',
    ]);
    expect(headers.every((header) => header.getAttribute('scope') === 'col')).toBe(true);
    expect(screen.getByRole('table', { name: '1 mudança pendente' })).toBeTruthy();
  });

  it('liga o item à tela dele quando a origem tem tela', () => {
    renderTable();

    const links = Object.fromEntries(
      screen.getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')]),
    );
    expect(links).toEqual({
      'Configuração v3': '/sites/exemplo-a/configuracao',
      'Conteúdo 42': '/sites/exemplo-a/conteudos/42',
      'Autor 5': '/sites/exemplo-a/autores/5',
      'Taxonomia 2': '/sites/exemplo-a/taxonomias/2',
      'Menu 1': '/sites/exemplo-a/menus/1',
      'Mídia 11': '/sites/exemplo-a/midia',
    });
  });

  it('sem tela, o item é só texto', () => {
    renderTable();

    for (const text of ['Redirecionamento 7', 'Release 2026.10.1', 'Plataforma tokens']) {
      const cell = screen.getByText(text);
      expect(cell.tagName).toBe('TD');
    }
  });

  it('mostra a data no fuso do site, com a sigla', () => {
    renderTable([change(1, 'content', '42')]);

    expect(screen.getAllByRole('row')[1]?.textContent).toContain('01/10/2026, 09:00 BRT');
  });

  it('sem pendências mostra o estado vazio no lugar da tabela', () => {
    renderTable([]);

    expect(screen.queryByRole('table')).toBeNull();
    expect(
      screen.getByText('Nenhuma mudança pendente: o site publicado está em dia.'),
    ).toBeTruthy();
  });
});
