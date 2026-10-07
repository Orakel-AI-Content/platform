// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Link from 'next/link';
import { afterEach, describe, expect, it } from 'vitest';

import type { ContentListItem } from '@/domain/content/contents.ts';

import { ContentsTable } from './contents-table.tsx';

// Lista de conteúdos (#44): status da versão mais recente, links por permissão e teclado.

afterEach(cleanup);

const rows: ContentListItem[] = [
  {
    id: 1,
    kind: 'article',
    title: 'Guia de uso',
    slug: 'guia-de-uso',
    status: 'em_revisao',
    version: 3,
    updatedAt: new Date('2026-10-01T12:00:00Z'),
  },
  {
    id: 2,
    kind: 'page',
    title: 'Sobre',
    slug: 'sobre',
    status: 'publicado',
    version: 1,
    updatedAt: new Date('2026-09-20T09:30:00Z'),
  },
];

describe('tabela de conteúdos', () => {
  it('mostra cada conteúdo com tipo e status da versão mais recente', () => {
    render(<ContentsTable siteId="exemplo-a" timeZone="America/Sao_Paulo" rows={rows} />);

    const [, first, second] = screen.getAllByRole('row');
    expect(first?.textContent).toContain('Artigo');
    expect(first?.textContent).toContain('Guia de uso');
    expect(first?.textContent).toContain('Em revisão');
    expect(second?.textContent).toContain('Página');
    expect(second?.textContent).toContain('Publicado');
    expect(screen.getByText('2 conteúdos')).toBeTruthy();
  });

  it('dá a cada status o badge da sua variante, com o texto do status (#86)', () => {
    render(<ContentsTable siteId="exemplo-a" timeZone="America/Sao_Paulo" rows={rows} />);

    expect(screen.getByText('Em revisão').className).toContain('text-warning');
    expect(screen.getByText('Publicado').className).toContain('bg-success');
  });

  it('sem content.write não tem links de criar nem de editar', () => {
    render(<ContentsTable siteId="exemplo-a" timeZone="America/Sao_Paulo" rows={rows} />);

    expect(screen.queryByRole('link', { name: 'Criar conteúdo' })).toBeNull();
    expect(screen.queryByRole('link', { name: /^Editar/ })).toBeNull();
  });

  it('com content.write tem o link de editar, e o de criar fica no cabeçalho da página', () => {
    render(<ContentsTable siteId="exemplo-a" rows={rows} canWrite />);

    expect(screen.queryByRole('link', { name: 'Criar conteúdo' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Editar Guia de uso' }).getAttribute('href')).toBe(
      '/sites/exemplo-a/conteudos/1/editar',
    );
  });

  it('o teclado alcança o link de versões de cada linha', async () => {
    const user = userEvent.setup();
    render(<ContentsTable siteId="exemplo-a" timeZone="America/Sao_Paulo" rows={rows} />);

    await user.tab();
    const first = screen.getByRole('link', { name: 'Guia de uso (versões)' });
    expect(document.activeElement).toBe(first);
    expect(first.getAttribute('href')).toBe('/sites/exemplo-a/conteudos/1');
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Sobre (versões)' }));
  });

  it('sem conteúdo mostra o estado vazio no lugar da tabela, com a ação recebida', () => {
    render(
      <ContentsTable
        siteId="exemplo-a"
        rows={[]}
        canWrite
        emptyAction={<Link href="/sites/exemplo-a/conteudos/novo">Criar conteúdo</Link>}
      />,
    );

    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Nenhum conteúdo cadastrado.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Criar conteúdo' }).getAttribute('href')).toBe(
      '/sites/exemplo-a/conteudos/novo',
    );
  });

  it('mostra a data de atualização no fuso do site, com a sigla (#90)', () => {
    const { rerender } = render(
      <ContentsTable siteId="exemplo-a" timeZone="America/Sao_Paulo" rows={rows} />,
    );
    expect(screen.getAllByRole('row')[1]?.textContent).toContain('01/10/2026, 09:00 BRT');

    rerender(<ContentsTable siteId="exemplo-a" timeZone="Europe/Lisbon" rows={rows} />);
    expect(screen.getAllByRole('row')[1]?.textContent).toContain('01/10/2026, 13:00 GMT+1');
  });
});
