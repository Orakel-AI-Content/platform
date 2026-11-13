// @vitest-environment happy-dom
import type { Block } from '@orakel/content-model/v1';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { VersionReferences } from '@/components/contents/ContentVersionView';

import { ReviewChanges, type ReviewChangesData } from './ReviewChanges.tsx';

// "O que mudou" da revisão (#768): campos e blocos alterados, com o antes e o depois.
// Versão da correção automática (#804): o comentário da devolução que a pediu.

afterEach(cleanup);

const text = (n: number, value: string): Block => ({
  n,
  type: 'text',
  content: [{ type: 'paragraph', children: [{ type: 'text', text: value }] }],
});

const references: VersionReferences = {
  authors: new Map(),
  taxonomies: new Map([
    [1, 'Hortas (categoria)'],
    [2, 'Iniciantes (tag)'],
  ]),
  media: new Map(),
};

const changes: ReviewChangesData = {
  baseVersion: 2,
  version: 4,
  fields: [
    { field: 'title', before: 'Guia completo', after: 'Guia revisto' },
    { field: 'description', before: 'Tudo para começar.', after: undefined },
    { field: 'taxonomyIds', before: [1], after: [1, 2] },
    {
      field: 'publishedAt',
      before: '2026-09-20T13:00:00.000Z',
      after: '2026-09-21T13:00:00.000Z',
    },
  ],
  blocks: [
    { n: 1, kind: 'alterado', before: text(1, 'Olá'), after: text(1, 'Olá de novo') },
    { n: 3, kind: 'removido', before: text(3, 'Fim antigo') },
    { n: 4, kind: 'adicionado', after: { n: 4, type: 'toc', title: 'Neste guia' } },
  ],
  correction: null,
};

const renderChanges = (data: ReviewChangesData = changes) =>
  render(<ReviewChanges changes={data} references={references} timeZone="America/Sao_Paulo" />);

const section = () => screen.getByRole('region', { name: 'O que mudou' });

describe('o que mudou desde a última revisão', () => {
  it('seção com título próprio e as duas versões comparadas', () => {
    renderChanges();

    expect(within(section()).getByRole('heading', { level: 2 }).textContent).toBe('O que mudou');
    expect(section().textContent).toContain('Da versão 2, a da última revisão, para a versão 4.');
  });

  it('lista cada campo alterado com o antes e o depois, com nomes e datas legíveis', () => {
    renderChanges();

    const fields = within(section()).getByRole('region', { name: 'Campos' });
    const term = (label: string) =>
      within(fields).getByText(label, { selector: 'dt' }).parentElement!;
    expect(
      within(fields)
        .getAllByRole('term')
        .map((item) => item.textContent),
    ).toEqual(['Título', 'Descrição', 'Taxonomias', 'Data de publicação']);
    expect(
      within(term('Título'))
        .getAllByRole('definition')
        .map((item) => item.textContent),
    ).toEqual(['Antes: Guia completo', 'Depois: Guia revisto']);
    expect(term('Descrição').textContent).toContain('Depois: —');
    expect(term('Taxonomias').textContent).toContain(
      'Depois: Hortas (categoria), Iniciantes (tag)',
    );
    expect(term('Data de publicação').textContent).toContain('20/09/2026');
    expect(term('Data de publicação').textContent).toContain('21/09/2026');
  });

  it('lista cada bloco pelo n, com o tipo da mudança, o antes e o depois', () => {
    renderChanges();

    const blocks = within(section()).getByRole('region', { name: 'Blocos' });
    const items = within(blocks).getAllByRole('listitem');
    expect(
      items.map((item) => within(item).getByRole('heading', { level: 4 }).textContent),
    ).toEqual([
      'Texto · bloco 1: Alterado',
      'Texto · bloco 3: Removido',
      'Sumário · bloco 4: Adicionado',
    ]);
    expect(items[0]!.textContent).toMatch(/Antes.*Olá.*Depois.*Olá de novo/);
    expect(items[1]!.textContent).toContain('Fim antigo');
    expect(items[1]!.textContent).not.toContain('Depois');
    expect(items[2]!.textContent).toContain('Neste guia');
    expect(items[2]!.textContent).not.toContain('Antes');
  });

  it('fora da correção automática, não mostra comentário de devolução', () => {
    renderChanges();

    expect(within(section()).queryByRole('region', { name: 'Correção automática' })).toBeNull();
  });

  it('da correção automática, mostra o comentário do revisor que a pediu (#804)', () => {
    renderChanges({
      ...changes,
      correction: { reviewer: 'revisor@orakel.local', comment: 'Falta a fonte.\nRevise o título.' },
    });

    const correction = within(section()).getByRole('region', { name: 'Correção automática' });
    expect(correction.textContent).toContain(
      'A versão 4 foi criada pela correção automática, a partir do comentário de revisor@orakel.local na devolução:',
    );
    expect(correction.querySelector('blockquote')?.textContent).toBe(
      'Falta a fonte.\nRevise o título.',
    );
    expect(section().textContent).toContain('Da versão 2, a da última revisão, para a versão 4.');
  });

  it('sem nada alterado, diz que nada mudou e não mostra as listas', () => {
    renderChanges({ ...changes, fields: [], blocks: [] });

    expect(section().textContent).toContain('Nenhum campo nem bloco mudou.');
    expect(within(section()).queryByRole('region', { name: 'Campos' })).toBeNull();
    expect(within(section()).queryByRole('region', { name: 'Blocos' })).toBeNull();
  });
});
