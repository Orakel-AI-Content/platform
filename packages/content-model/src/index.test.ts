import { describe, expect, it } from 'vitest';

import { isSupportedSchemaVersion, SUPPORTED_SCHEMA_VERSIONS } from './index.ts';
import { SCHEMA_VERSION as V1 } from './v1/index.ts';

describe('versões suportadas', () => {
  it('inclui a versão de cada subcaminho', () => {
    expect(SUPPORTED_SCHEMA_VERSIONS).toContain(V1);
  });

  it.each([1])('aceita %s', (version) => {
    expect(isSupportedSchemaVersion(version)).toBe(true);
  });

  it.each([0, 2, '1', undefined])('recusa %s', (version) => {
    expect(isSupportedSchemaVersion(version)).toBe(false);
  });
});
