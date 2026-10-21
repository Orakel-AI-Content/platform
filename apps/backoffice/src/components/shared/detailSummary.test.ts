import { describe, expect, it } from 'vitest';

import { DETAIL_SUMMARY_CLASS, DETAIL_SUMMARY_LIST_CLASS } from './detailSummary.ts';

// A coluna de resumo tem a mesma largura nas telas de detalhe, e o InfoList dela, o
// espaçamento do ProfileSection do Ecme (#445).

describe('resumo das telas de detalhe', () => {
  it('a coluna tem a largura do cartão de perfil', () => {
    expect(DETAIL_SUMMARY_CLASS.split(' ')).toEqual(
      expect.arrayContaining([
        'min-w-[330px]',
        'xl:max-w-[330px]',
        '2xl:min-w-[400px]',
        '2xl:max-w-[400px]',
      ]),
    );
  });

  it('a lista tem o espaçamento do ProfileSection', () => {
    expect(DETAIL_SUMMARY_LIST_CLASS.split(' ')).toEqual(
      expect.arrayContaining(['gap-y-7', 'gap-x-4']),
    );
  });
});
