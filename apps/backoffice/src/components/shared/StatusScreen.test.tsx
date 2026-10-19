// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import Link from 'next/link';
import { afterEach, describe, expect, it } from 'vitest';

import { StatusScreen } from './StatusScreen.tsx';

// Tela de estado (#77): título como heading da seção, frase e ação.

afterEach(cleanup);

describe('tela de estado', () => {
  it('mostra o título, a frase e a ação, com a seção nomeada pelo título', () => {
    render(
      <StatusScreen
        title="Página não encontrada"
        action={<Link href="/sites">Ir para os sites</Link>}
      >
        O endereço não existe.
      </StatusScreen>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Página não encontrada' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Página não encontrada' })).toBeTruthy();
    expect(screen.getByText('O endereço não existe.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ir para os sites' }).getAttribute('href')).toBe(
      '/sites',
    );
  });

  it('sem ação, não desenha a área de ações', () => {
    render(<StatusScreen title="Erro">Falhou.</StatusScreen>);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
