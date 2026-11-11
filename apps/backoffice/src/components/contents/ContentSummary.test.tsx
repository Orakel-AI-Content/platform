// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ContentSummary } from './ContentSummary.tsx';

// Resumo do detalhe do conteúdo (#597): autores e taxonomias pelo nome, "removido (ID n)" no
// que não existe mais, e as datas de publicação e da última alteração no fuso do site.

afterEach(cleanup);

const data = {
  kind: 'article' as const,
  slug: 'como-plantar-alface',
  authorIds: [1, 9],
  taxonomyIds: [3],
  publishedAt: '2026-10-01T12:00:00Z',
};

const references = {
  authors: new Map([[1, 'Ana Souza']]),
  taxonomies: new Map([[3, 'Hortas (categoria)']]),
};

/** O valor (`dd`) do campo pelo rótulo (`dt`). */
function field(label: string): string | null | undefined {
  return screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;
}

describe('resumo do conteúdo', () => {
  it('mostra autores e taxonomias pelo nome e as datas no fuso do site', () => {
    render(
      <ContentSummary
        contentId={42}
        data={data}
        status="publicado"
        updatedAt={new Date('2026-11-09T18:30:00Z')}
        timeZone="America/Sao_Paulo"
        references={references}
      />,
    );

    expect(field('Tipo')).toBe('Artigo');
    expect(field('ID')).toBe('42');
    expect(field('Slug')).toBe('/como-plantar-alface');
    expect(field('Status')).toBe('Publicado');
    expect(field('Autores')).toBe('Ana Souza, removido (ID 9)');
    expect(field('Taxonomias')).toBe('Hortas (categoria)');
    expect(field('Data de publicação')).toBe('01/10/2026, 09:00 BRT');
    expect(field('Última alteração')).toBe('09/11/2026, 15:30 BRT');
  });

  it('sem autores nem taxonomias, um traço', () => {
    render(
      <ContentSummary
        contentId={42}
        data={{ ...data, authorIds: [], taxonomyIds: [] }}
        status="rascunho"
        updatedAt={new Date('2026-11-09T18:30:00Z')}
        timeZone="America/Sao_Paulo"
        references={references}
      />,
    );

    expect(field('Autores')).toBe('—');
    expect(field('Taxonomias')).toBe('—');
  });
});
