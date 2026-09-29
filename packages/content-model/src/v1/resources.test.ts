import { describe, expect, it } from 'vitest';

import {
  BLOCK_TYPES,
  PAGE_TYPES,
  RESOURCES,
  ResourcesSchema,
  VARIANT_COMPONENTS,
} from './resources.ts';
import { SCHEMA_VERSION } from './version.ts';

describe('RESOURCES da v1', () => {
  it('é um Resources válido, da versão deste subcaminho', () => {
    expect(ResourcesSchema.parse(RESOURCES)).toEqual(RESOURCES);
    expect(RESOURCES.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('cobre todos os tipos de bloco, de página e componentes com variante', () => {
    expect(RESOURCES.blockTypes).toEqual([...BLOCK_TYPES]);
    expect(Object.keys(RESOURCES.presets)).toEqual([...PAGE_TYPES]);
    expect(Object.keys(RESOURCES.variants)).toEqual([...VARIANT_COMPONENTS]);
  });

  it('recusa recursos sem tipo de bloco', () => {
    expect(ResourcesSchema.safeParse({ ...RESOURCES, blockTypes: [] }).success).toBe(false);
  });
});
