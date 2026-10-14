import { describe, expect, it } from 'vitest';

import { mediaItems } from './items.ts';

// Miniatura da biblioteca (#52): menor largura, AVIF antes do WebP, em media.<domínio>, e os
// formatos disponíveis (#187).

describe('miniaturas da biblioteca de mídia', () => {
  it('usa a menor largura, com AVIF em <source> e WebP de reserva, em media.<domínio>', () => {
    const [thumbnail] = mediaItems('horta.test', [
      {
        id: 7,
        width: 1600,
        height: 900,
        variants: [
          { width: 640, format: 'webp', path: 'horta/abc-640.webp' },
          { width: 320, format: 'webp', path: 'horta/abc-320.webp' },
          { width: 320, format: 'avif', path: 'horta/abc-320.avif' },
          { width: 640, format: 'avif', path: 'horta/abc-640.avif' },
        ],
      },
    ]);

    expect(thumbnail).toEqual({
      id: 7,
      width: 1600,
      height: 900,
      sources: [{ type: 'image/avif', url: 'https://media.horta.test/horta/abc-320.avif' }],
      src: 'https://media.horta.test/horta/abc-320.webp',
      // Formatos distintos das variantes, para os detalhes (#187).
      formats: ['avif', 'webp'],
    });
  });
});
