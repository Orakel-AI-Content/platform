import { describe, expect, it } from 'vitest';

import {
  BUILD_STATUS_LABEL,
  BUILD_STATUS_VARIANT,
  CONTENT_STATUS_LABEL,
  CONTENT_STATUS_VARIANT,
  SITE_STATE_LABEL,
  SITE_STATE_VARIANT,
} from './site-labels.ts';

// Cada estado tem aparência própria dentro do seu grupo (#86): a variante não se repete e
// todo estado tem rótulo, porque o texto é o que distingue os estados sem cor.

const groups = [
  ['status de conteúdo', CONTENT_STATUS_LABEL, CONTENT_STATUS_VARIANT],
  ['estado de site', SITE_STATE_LABEL, SITE_STATE_VARIANT],
  ['resultado de build', BUILD_STATUS_LABEL, BUILD_STATUS_VARIANT],
] as const;

describe.each(groups)('%s', (_, labels, variants) => {
  it('não repete variante entre dois estados', () => {
    const used = Object.values(variants);
    expect(new Set(used).size).toBe(used.length);
  });

  it('tem rótulo e variante para os mesmos estados', () => {
    expect(Object.keys(variants).sort()).toEqual(Object.keys(labels).sort());
    for (const label of Object.values(labels)) expect(label).not.toBe('');
  });
});
