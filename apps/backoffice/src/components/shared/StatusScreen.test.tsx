// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import Link from 'next/link';
import { afterEach, describe, expect, it } from 'vitest';

import FileNotFound from '@/assets/svg/FileNotFound';

import { StatusScreen } from './StatusScreen.tsx';

// Tela de estado (#77): título como heading da seção, frase e ação; ilustração do template
// (#379) por cima, oculta do leitor de tela.

afterEach(cleanup);

describe('tela de estado', () => {
  it('mostra o título, a frase e a ação, com a seção nomeada pelo título', () => {
    render(
      <StatusScreen
        title="Página não encontrada"
        illustration={<FileNotFound height={280} width={280} />}
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
    render(
      <StatusScreen title="Erro" illustration={<FileNotFound />}>
        Falhou.
      </StatusScreen>,
    );
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('mostra a ilustração por cima do título, oculta do leitor de tela', () => {
    const { container } = render(
      <StatusScreen title="Erro" illustration={<FileNotFound height={280} width={280} />}>
        Falhou.
      </StatusScreen>,
    );
    const section = screen.getByRole('region', { name: 'Erro' });
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('focusable')).toBe('false');
    // Por cima do título, como no `AccessDenied` do template.
    expect(section.firstElementChild).toBe(svg);
  });
});
