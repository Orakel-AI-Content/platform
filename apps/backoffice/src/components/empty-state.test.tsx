// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import Link from 'next/link';
import { afterEach, describe, expect, it } from 'vitest';

import { EmptyState } from './empty-state.tsx';

// Estado vazio das listas (#87): mensagem sempre; a ação só quando a página a passa.

afterEach(cleanup);

describe('estado vazio', () => {
  it('sem ação mostra só a mensagem', () => {
    render(<EmptyState>Nenhum autor cadastrado.</EmptyState>);

    expect(screen.getByText('Nenhum autor cadastrado.')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('com ação mostra a mensagem e a ação', () => {
    render(
      <EmptyState action={<Link href="/sites/exemplo-a/autores/novo">Criar autor</Link>}>
        Nenhum autor cadastrado.
      </EmptyState>,
    );

    expect(screen.getByText('Nenhum autor cadastrado.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Criar autor' }).getAttribute('href')).toBe(
      '/sites/exemplo-a/autores/novo',
    );
  });
});
