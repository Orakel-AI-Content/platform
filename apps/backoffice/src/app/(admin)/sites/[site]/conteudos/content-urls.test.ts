import { describe, expect, it, vi } from 'vitest';

import { previewUrl, publicUrl } from './content-urls.ts';

vi.mock('@/env.ts', () => ({
  getEnv: () => ({ PREVIEW_BASE_URL: 'https://preview.orakel.local' }),
}));

describe('endereços de um conteúdo', () => {
  it('prévia no host de visualização, com o site e o caminho do conteúdo', () => {
    expect(previewUrl('horta-em-casa', { slug: 'como-plantar-alface' })).toBe(
      'https://preview.orakel.local/horta-em-casa/como-plantar-alface/',
    );
  });

  it('endereço público no domínio principal do site', () => {
    expect(publicUrl('hortaemcasa.com.br', { slug: 'como-plantar-alface' })).toBe(
      'https://hortaemcasa.com.br/como-plantar-alface/',
    );
  });

  it('sem domínio, não há endereço público', () => {
    expect(publicUrl('', { slug: 'como-plantar-alface' })).toBeUndefined();
  });
});
