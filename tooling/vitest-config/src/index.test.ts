import { describe, expect, it } from 'vitest';

import { coverageThreshold, withCoverageThreshold } from './index.ts';

describe('coverageThreshold', () => {
  it('aplica o mesmo percentual a linhas e branches', () => {
    expect(coverageThreshold(90)).toEqual({ lines: 90, branches: 90 });
  });

  it.each([-1, 101, Number.NaN])('rejeita %s', (value) => {
    expect(() => coverageThreshold(value)).toThrow(RangeError);
  });
});

describe('withCoverageThreshold', () => {
  it('liga a coverage com a meta', () => {
    expect(withCoverageThreshold(90).test?.coverage).toMatchObject({
      enabled: true,
      thresholds: { lines: 90, branches: 90 },
    });
  });
});
