import { describe, expect, it } from 'vitest';

import { isSupportedFormatVersion, SUPPORTED_FORMAT_VERSIONS } from './index.ts';
import { FORMAT_VERSION as V1 } from './v1/index.ts';

describe('versões suportadas', () => {
  it('inclui a versão de cada subcaminho', () => {
    expect(SUPPORTED_FORMAT_VERSIONS).toContain(V1);
  });

  it('aceita 1 e recusa o resto', () => {
    expect(isSupportedFormatVersion(1)).toBe(true);
    for (const value of [0, 2, '1', undefined]) expect(isSupportedFormatVersion(value)).toBe(false);
  });
});
