import { describe, expect, it } from 'vitest';

import { itemTitle } from './item-title.ts';

// Título da aba das páginas de item (#79).

describe('itemTitle', () => {
  it('põe o item antes da área', () => {
    expect(itemTitle('Guia de Lisboa', 'Editar conteúdo')).toBe('Guia de Lisboa · Editar conteúdo');
  });

  it('sem item (ou só espaços), fica só a área', () => {
    expect(itemTitle(undefined, 'Editar autor')).toBe('Editar autor');
    expect(itemTitle('   ', 'Editar menu')).toBe('Editar menu');
  });
});
