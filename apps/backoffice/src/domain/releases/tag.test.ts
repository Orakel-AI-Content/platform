import { describe, expect, it } from 'vitest';

import { ReleaseTagSchema } from './tag.ts';

describe('ReleaseTagSchema', () => {
  it.each(['core-v0.1.0', 'core-v1.2.3', 'core-v10.20.30', ' core-v1.0.0 '])('aceita %j', (tag) => {
    expect(ReleaseTagSchema.safeParse(tag).success).toBe(true);
  });

  it.each(['v1.2.3', 'core-v1.2', 'core-v1.2.3-rc.1', 'core-1.2.3', 'CORE-V1.2.3', ''])(
    'recusa %j',
    (tag) => {
      expect(ReleaseTagSchema.safeParse(tag).success).toBe(false);
    },
  );

  it('apara os espaços', () => {
    expect(ReleaseTagSchema.parse(' core-v1.0.0 ')).toBe('core-v1.0.0');
  });
});
