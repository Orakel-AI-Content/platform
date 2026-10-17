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

  it('classes do Ecme, sem as do shadcn: texto do body (#247)', () => {
    const { container } = render(<EmptyState>Nenhum autor cadastrado.</EmptyState>);

    const classes = [...container.querySelectorAll('*')].flatMap((element) =>
      (element.getAttribute('class') ?? '').split(' '),
    );
    for (const shadcn of ['text-muted-foreground', 'border-border', 'bg-muted']) {
      expect(classes).not.toContain(shadcn);
    }
    expect(screen.getByText('Nenhum autor cadastrado.').className).toBe(
      'text-gray-600 dark:text-gray-400',
    );
  });
});
