// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ContentVersionsTable, type ContentVersionRow } from './content-versions-table.tsx';

// Versões de um conteúdo (#44): em ordem, cada uma com link para a leitura.

afterEach(cleanup);

const rows: ContentVersionRow[] = [1, 2, 3].map((version) => ({
  version,
  status: version === 1 ? 'publicado' : 'rascunho',
  title: `Guia v${version}`,
  createdAt: new Date(`2026-10-0${version}T12:00:00Z`),
}));

describe('tabela de versões', () => {
  it('lista as versões em ordem crescente com link para cada uma', () => {
    render(<ContentVersionsTable siteId="exemplo-a" contentId={7} rows={rows} />);

    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Versão 1', 'Versão 2', 'Versão 3']);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/sites/exemplo-a/conteudos/7/versoes/1',
      '/sites/exemplo-a/conteudos/7/versoes/2',
      '/sites/exemplo-a/conteudos/7/versoes/3',
    ]);
    expect(screen.getAllByRole('row')[1]?.textContent).toContain('Publicado');
    expect(screen.getByText('3 versões')).toBeTruthy();
  });

  it('dá a cada status o badge da sua variante, com o texto do status (#86)', () => {
    render(<ContentVersionsTable siteId="exemplo-a" contentId={7} rows={rows} />);

    expect(screen.getByText('Publicado').className).toContain('bg-success');
    for (const badge of screen.getAllByText('Rascunho')) {
      expect(badge.className).toContain('bg-muted');
    }
  });
});
