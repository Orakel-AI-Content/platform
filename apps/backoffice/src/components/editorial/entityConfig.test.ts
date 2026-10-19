import { describe, expect, it } from 'vitest';

import { ENTITY_CONFIG } from './entityConfig.ts';

describe('ENTITY_CONFIG', () => {
  it('formata a linha do autor, com travessão sem área de atuação', () => {
    const author = { id: 7, slug: 'ana', name: 'Ana' };
    expect(ENTITY_CONFIG.author.list.row(author)).toEqual({
      id: 7,
      name: 'Ana',
      cells: ['ana', '—'],
    });
    expect(ENTITY_CONFIG.author.itemName(author)).toBe('Ana');
  });

  it('mostra o tipo da taxonomia pelo rótulo', () => {
    const taxonomy = { id: 3, kind: 'series', slug: 'guias', name: 'Guias' } as const;
    expect(ENTITY_CONFIG.taxonomy.list.row(taxonomy)).toEqual({
      id: 3,
      name: 'Guias',
      cells: ['Série', 'guias'],
    });
  });

  it('nomeia o menu pela chave e junta os itens numa célula', () => {
    const menu = {
      id: 2,
      key: 'principal',
      items: [
        { label: 'Início', href: '/' },
        { label: 'Sobre', href: '/sobre' },
      ],
    };
    expect(ENTITY_CONFIG.menu.itemName(menu)).toBe('principal');
    expect(ENTITY_CONFIG.menu.list.row(menu).cells).toEqual(['Início (/) · Sobre (/sobre)']);
  });

  it('só o autor tem campo de mídia, e só com a biblioteca do site', () => {
    expect(ENTITY_CONFIG.author.fields?.(undefined)).toEqual({});
    expect(ENTITY_CONFIG.taxonomy.fields).toBeUndefined();
    expect(ENTITY_CONFIG.menu.fields).toBeUndefined();
  });
});
