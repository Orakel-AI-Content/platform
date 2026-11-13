import { describe, expect, it } from 'vitest';

import type { Opinion, OpinionPoint } from './opinion.ts';
import { opinionOutlook } from './opinions.ts';

// Resultado do parecer na fila de revisão (#774): a redução do estado a uma palavra.

const point = (verdict: 'atende' | 'nao_atende' | 'inconclusivo'): OpinionPoint => ({
  verdict,
  justification: 'Justificativa.',
  excerpts: ['Trecho.'],
});

const ready = (opinion: Partial<Opinion>) =>
  opinionOutlook({
    state: 'pronto',
    opinion: {
      valor_original: point('atende'),
      politicas_anuncios_afiliados: point('atende'),
      linha_editorial: point('atende'),
      ...opinion,
    },
  });

describe('opinionOutlook', () => {
  it('todos os pontos atendem: favorável', () => {
    expect(ready({})).toBe('favoravel');
  });

  it('a linha editorial não avaliada não pesa: favorável', () => {
    expect(ready({ linha_editorial: { verdict: 'nao_avaliado' } })).toBe('favoravel');
  });

  it('um ponto que não atende: com ressalvas', () => {
    expect(ready({ politicas_anuncios_afiliados: point('nao_atende') })).toBe('com_ressalvas');
  });

  it('um ponto inconclusivo: com ressalvas', () => {
    expect(ready({ valor_original: point('inconclusivo') })).toBe('com_ressalvas');
  });

  it('pendente, falha e ausente ficam como estão', () => {
    expect(opinionOutlook({ state: 'pendente' })).toBe('pendente');
    expect(opinionOutlook({ state: 'falha', issues: [] })).toBe('falha');
    expect(opinionOutlook({ state: 'ausente' })).toBe('ausente');
  });
});
