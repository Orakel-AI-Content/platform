import { RESOURCES, type Resources } from '@orakel/content-model/v1';
import { describe, expect, it } from 'vitest';

import { missingVariants } from './reprocess.ts';

const variants = (widths: number[]) =>
  widths.flatMap((width) =>
    ['avif', 'webp'].map((format) => ({ width, format, path: `s/h-${width}.${format}` })),
  );

describe('missingVariants', () => {
  it('mídia completa no perfil: nada falta', () => {
    expect(
      missingVariants({ width: 2560, variants: variants([320, 640, 960, 1280, 1920]) }),
    ).toEqual([]);
  });

  it('largura nova no perfil: só ela, nos dois formatos', () => {
    const resources: Resources = {
      ...RESOURCES,
      imageProfile: { ...RESOURCES.imageProfile, widths: [320, 640, 960, 1280, 1920, 2400] },
    };
    expect(
      missingVariants({ width: 2560, variants: variants([320, 640, 960, 1280, 1920]) }, resources),
    ).toEqual([
      { width: 2400, format: 'avif' },
      { width: 2400, format: 'webp' },
    ]);
  });

  it('largura nova maior que o original não é pedida (sem ampliar)', () => {
    const resources: Resources = {
      ...RESOURCES,
      imageProfile: { ...RESOURCES.imageProfile, widths: [320, 640, 1000] },
    };
    expect(missingVariants({ width: 800, variants: variants([320, 640]) }, resources)).toEqual([]);
  });

  it('variante extra registrada fora do perfil não conta nem é apagada', () => {
    expect(
      missingVariants({ width: 800, variants: [...variants([320, 640]), ...variants([480])] }),
    ).toEqual([]);
  });
});
