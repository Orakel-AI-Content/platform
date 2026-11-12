import { describe, expect, it } from 'vitest';

import type { ReviewCheck } from '@/domain/reviews/checks.ts';

import { findingWhere, hasError, reviewCheckItems } from './reviewCheckItems.ts';

const ok = (key: ReviewCheck['key'], label: string): ReviewCheck => ({
  key,
  label,
  level: 'ok',
  findings: [],
});

const checks: ReviewCheck[] = [
  {
    key: 'capa',
    label: 'Imagem de capa',
    level: 'aviso',
    findings: [{ message: 'O conteúdo não tem imagem de capa', path: ['coverMediaId'] }],
  },
  {
    key: 'links_internos',
    label: 'Links internos levam a páginas do site',
    level: 'aviso',
    findings: [
      { message: 'O link para /x não leva a nenhuma página do site', path: ['blocks', 2] },
    ],
  },
  ok('titulo_duplicado', 'Título diferente dos outros conteúdos do site'),
];

const blocks = [{ n: 10 }, { n: 11 }, { n: 12 }];

describe('onde está a pendência', () => {
  it('bloco pela posição, campo pelo rótulo do editor, conteúdo todo sem lugar', () => {
    expect(findingWhere(['blocks', 0, 'alt'])).toBe('Bloco 1');
    expect(findingWhere(['coverMediaId'])).toBe('Capa');
    expect(findingWhere(['seo', 'title'])).toBe('Título para buscadores');
    expect(findingWhere(['taxonomyIds'])).toBe('Taxonomias');
    expect(findingWhere([])).toBe('');
  });
});

describe('itens da seção de checagens', () => {
  it('põe os links externos logo depois dos internos, com o onde de cada pendência', () => {
    const items = reviewCheckItems(checks, { state: 'sem_links' }, blocks);

    expect(items.map((item) => [item.key, item.state])).toEqual([
      ['capa', 'aviso'],
      ['links_internos', 'aviso'],
      ['links_externos', 'ok'],
      ['titulo_duplicado', 'ok'],
    ]);
    expect(items[0]?.findings).toEqual([
      { message: 'O conteúdo não tem imagem de capa', where: 'Capa' },
    ]);
    expect(items[1]?.findings[0]?.where).toBe('Bloco 3');
  });

  it('links externos: verificando e não verificado passam como estado, sem pendência', () => {
    for (const state of ['verificando', 'nao_verificado'] as const) {
      const external = reviewCheckItems(checks, { state }, blocks)[2];
      expect(external).toMatchObject({ key: 'links_externos', state, findings: [] });
    }
  });

  it('link externo fora do ar é aviso, no bloco pela posição do n', () => {
    const external = reviewCheckItems(
      checks,
      {
        state: 'verificado',
        links: [
          { blockN: 10, url: 'https://ok.example', ok: true },
          { blockN: 12, url: 'https://fora.example', ok: false, reason: 'HTTP 404' },
        ],
      },
      blocks,
    )[2];

    expect(external?.state).toBe('aviso');
    expect(external?.findings).toEqual([
      { message: 'O link https://fora.example não respondeu: HTTP 404', where: 'Bloco 3' },
    ]);
  });

  it('só erro barra a aprovação; aviso não', () => {
    const items = reviewCheckItems(checks, { state: 'verificando' }, blocks);
    expect(hasError(items)).toBe(false);
    expect(
      hasError([
        ...items,
        { key: 'validacao_release', label: 'Validação', state: 'erro', findings: [] },
      ]),
    ).toBe(true);
  });
});
