// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ContentVersionsTable, type ContentVersionRow } from './ContentVersionsTable.tsx';

// Versões de um conteúdo (#44): em ordem, cada uma com link para a leitura.

afterEach(cleanup);

const rows: ContentVersionRow[] = [1, 2, 3].map((version) => ({
  version,
  status: version === 1 ? 'publicado' : 'rascunho',
  title: `Guia v${version}`,
  createdAt: new Date(`2026-10-0${version}T12:00:00Z`),
  approval: null,
}));

/** Cor do ponto da tag (o `prefixClass` da Tag do Ecme) em que o texto aparece. */
function tagColor(element: HTMLElement) {
  return element.closest('.tag')?.querySelector('.tag-prefix')?.className;
}

describe('tabela de versões', () => {
  it('lista as versões em ordem crescente com link para cada uma', () => {
    render(
      <ContentVersionsTable
        siteId="exemplo-a"
        contentId={7}
        timeZone="America/Sao_Paulo"
        rows={rows}
      />,
    );

    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Versão 1', 'Versão 2', 'Versão 3']);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/sites/exemplo-a/conteudos/7/versoes/1',
      '/sites/exemplo-a/conteudos/7/versoes/2',
      '/sites/exemplo-a/conteudos/7/versoes/3',
    ]);
    expect(screen.getAllByRole('row')[1]?.textContent).toContain('Publicado');
    expect(screen.getByText('3 versões')).toBeTruthy();
    expect(
      screen.getAllByRole('columnheader').map((th) => [th.textContent, th.getAttribute('scope')]),
    ).toEqual([
      ['Versão', 'col'],
      ['Status', 'col'],
      ['Título', 'col'],
      ['Gravada em', 'col'],
      ['Aprovação', 'col'],
    ]);
  });

  it('dá a cada status a tag da sua cor, com o texto do status (#86)', () => {
    render(
      <ContentVersionsTable
        siteId="exemplo-a"
        contentId={7}
        timeZone="America/Sao_Paulo"
        rows={rows}
      />,
    );

    expect(tagColor(screen.getByText('Publicado'))).toContain('bg-success');
    for (const tag of screen.getAllByText('Rascunho')) {
      expect(tagColor(tag)).toContain('bg-gray-400');
    }
  });

  it('mostra a data de cada versão no fuso do site, com a sigla (#90)', () => {
    const { rerender } = render(
      <ContentVersionsTable
        siteId="exemplo-a"
        contentId={7}
        timeZone="America/Sao_Paulo"
        rows={rows}
      />,
    );
    expect(screen.getAllByRole('row')[1]?.textContent).toContain('01/10/2026, 09:00 BRT');

    rerender(
      <ContentVersionsTable
        siteId="exemplo-a"
        contentId={7}
        timeZone="Europe/Lisbon"
        rows={rows}
      />,
    );
    expect(screen.getAllByRole('row')[1]?.textContent).toContain('01/10/2026, 13:00 GMT+1');
  });

  it('mostra quem aprovou e quando, no fuso do site; sem aprovação, a célula fica vazia (#76)', () => {
    const approved: ContentVersionRow[] = [
      { ...rows[0]!, approval: null },
      {
        ...rows[1]!,
        status: 'aprovado',
        approval: {
          reviewer: 'revisor@orakel.local',
          approvedAt: new Date('2026-10-01T12:00:00Z'),
        },
      },
    ];
    render(
      <ContentVersionsTable
        siteId="exemplo-a"
        contentId={7}
        timeZone="America/Sao_Paulo"
        rows={approved}
      />,
    );

    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toContain('Aprovação');
    const [, first, second] = screen.getAllByRole('row');
    const approvalCell = (row: HTMLElement | undefined) => row?.querySelectorAll('td')[4];
    expect(approvalCell(first)?.textContent).toBe('');
    expect(approvalCell(second)?.textContent).toContain('revisor@orakel.local');
    expect(approvalCell(second)?.textContent).toContain('01/10/2026, 09:00 BRT');
  });
});
