// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// "Não encontrado" do site (#78): tela de estado com o link de volta ao site da URL.

vi.mock('next/navigation', () => ({ useParams: () => ({ site: 'exemplo-a' }) }));

const { default: SiteNotFound } = await import('./not-found.tsx');

afterEach(cleanup);

describe('não encontrado do site', () => {
  it('mostra o título e o link para o site da URL', () => {
    render(<SiteNotFound />);
    expect(screen.getByRole('heading', { level: 1, name: 'Página não encontrada' })).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Ir para o site exemplo-a' }).getAttribute('href'),
    ).toBe('/sites/exemplo-a');
  });
});
