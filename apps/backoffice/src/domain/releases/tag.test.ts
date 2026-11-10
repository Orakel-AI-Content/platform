import { describe, expect, it } from 'vitest';

import { ReleaseTagSchema } from './tag.ts';

describe('ReleaseTagSchema', () => {
  it.each(['0.1.0', '1.2.0', '10.20.30', ' 1.0.0 '])('aceita %j', (tag) => {
    expect(ReleaseTagSchema.safeParse(tag).success).toBe(true);
  });

  // O valor é a tag da imagem (site-builder:X.Y.Z): o prefixo core-v existe só na tag Git.
  it.each(['core-v1.2.0', 'v1.2.0', '1.2', '1.2.0-rc.1', 'core-1.2.0', 'CORE-V1.2.0', ''])(
    'recusa %j',
    (tag) => {
      expect(ReleaseTagSchema.safeParse(tag).success).toBe(false);
    },
  );

  it('apara os espaços', () => {
    expect(ReleaseTagSchema.parse(' 1.0.0 ')).toBe('1.0.0');
  });
});
