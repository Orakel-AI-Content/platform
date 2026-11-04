// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PausedSitesAlert } from './PausedSitesAlert.tsx';

// Aviso global de site pausado (#511): só com site pausado, um link por site.

afterEach(cleanup);

const receitas = { id: 'receitas', name: 'Receitas', pausedReason: 'render: tema inexistente' };
const viagens = { id: 'viagens', name: 'Viagens', pausedReason: null };

describe('PausedSitesAlert', () => {
  it('sem site pausado não aparece', () => {
    const { container } = render(<PausedSitesAlert sites={[]} />);

    expect(container.innerHTML).toBe('');
  });

  it('um site pausado: o título no singular, o link e o motivo', () => {
    render(<PausedSitesAlert sites={[receitas]} />);

    expect(screen.getByText('Site pausado')).toBeTruthy();
    expect(screen.getByRole('listitem').textContent).toBe('Receitas: render: tema inexistente');
    expect(screen.getByRole('link', { name: 'Receitas' }).getAttribute('href')).toBe(
      '/sites/receitas',
    );
  });

  it('dois sites pausados: um link para cada', () => {
    render(<PausedSitesAlert sites={[receitas, viagens]} />);

    expect(screen.getByText('2 sites pausados')).toBeTruthy();
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/sites/receitas',
      '/sites/viagens',
    ]);
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Receitas: render: tema inexistente',
      'Viagens',
    ]);
  });
});
