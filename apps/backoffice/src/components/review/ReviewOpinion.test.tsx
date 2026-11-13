// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { Opinion } from '@/domain/reviews/opinion.ts';

import { ReviewOpinion, type OpinionPointLabel } from './ReviewOpinion.tsx';

// Parecer automático na revisão (workspace#94): os pontos com veredito, justificativa e trechos
// quando pronto; um aviso em texto quando pendente, com falha ou ausente.

afterEach(cleanup);

const points: OpinionPointLabel[] = [
  { key: 'valor_original', label: 'Valor original' },
  { key: 'politicas_anuncios_afiliados', label: 'Políticas de anúncios e afiliados' },
  { key: 'linha_editorial', label: 'Linha editorial' },
];

const opinion: Opinion = {
  valor_original: {
    verdict: 'atende',
    justification: 'Traz uma comparação própria.',
    excerpts: ['comparamos os três modelos', 'na nossa medição'],
  },
  politicas_anuncios_afiliados: {
    verdict: 'nao_atende',
    justification: 'Promete ganho garantido.',
    excerpts: ['lucro garantido'],
  },
  linha_editorial: { verdict: 'nao_avaliado' },
};

const section = () => screen.getByRole('region', { name: 'Parecer automático' });
const pointRow = (label: string) => within(section()).getByText(label).closest('li') as HTMLElement;

describe('parecer automático', () => {
  it('pronto: cada ponto com rótulo, veredito, justificativa e trechos citados', () => {
    render(<ReviewOpinion state={{ state: 'pronto', opinion }} points={points} />);

    const original = pointRow('Valor original');
    expect(within(original).getByText('Atende')).toBeTruthy();
    expect(within(original).getByText('Traz uma comparação própria.')).toBeTruthy();
    const excerpts = within(original).getByRole('list', { name: 'Trechos citados' });
    expect(
      within(excerpts)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['comparamos os três modelos', 'na nossa medição']);

    const policies = pointRow('Políticas de anúncios e afiliados');
    expect(within(policies).getByText('Não atende')).toBeTruthy();
    expect(within(policies).getByText('Promete ganho garantido.')).toBeTruthy();
    expect(within(policies).getByText('lucro garantido')).toBeTruthy();
  });

  it('pronto: ponto não avaliado mostra o motivo, sem justificativa nem trechos', () => {
    render(<ReviewOpinion state={{ state: 'pronto', opinion }} points={points} />);

    const line = pointRow('Linha editorial');
    expect(within(line).getByText('Não avaliado')).toBeTruthy();
    expect(within(line).getByText(/não tem contexto editorial/)).toBeTruthy();
    expect(within(line).queryByRole('list', { name: 'Trechos citados' })).toBeNull();
  });

  it.each([
    ['pendente', /Parecer em preparação/],
    ['falha', /Não foi possível fazer o parecer/],
    ['ausente', /não tem parecer/],
  ] as const)('%s: aviso em texto, sem os pontos', (state, notice) => {
    render(
      <ReviewOpinion
        state={state === 'falha' ? { state, issues: [] } : { state }}
        points={points}
      />,
    );

    expect(within(section()).getByText(notice)).toBeTruthy();
    expect(within(section()).queryByText('Valor original')).toBeNull();
  });
});
