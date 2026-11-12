import { describe, expect, it } from 'vitest';

import { nextVersion } from './next-version.ts';

describe('nextVersion', () => {
  it.each([
    ['patch', '1.2.4'],
    ['minor', '1.3.0'],
    ['major', '2.0.0'],
  ] as const)('a partir de 1.2.3, %s dá %s', (bump, expected) => {
    expect(nextVersion(['1.0.0', '1.2.3', '1.1.9'], bump)).toBe(expected);
  });

  it.each(['patch', 'minor', 'major'] as const)('sem nenhuma release, %s dá 0.1.0', (bump) => {
    expect(nextVersion([], bump)).toBe('0.1.0');
  });

  it('ordena pelo número, não pelo texto: 1.10.0 é maior que 1.9.0', () => {
    expect(nextVersion(['1.9.0', '1.10.0', '1.9.12'], 'patch')).toBe('1.10.1');
    expect(nextVersion(['9.0.0', '10.0.0'], 'major')).toBe('11.0.0');
  });

  it('ignora tags fora do formato X.Y.Z', () => {
    expect(nextVersion(['core-v9.0.0', '1.2', '1.0.0'], 'minor')).toBe('1.1.0');
    expect(nextVersion(['core-v9.0.0'], 'patch')).toBe('0.1.0');
  });
});
