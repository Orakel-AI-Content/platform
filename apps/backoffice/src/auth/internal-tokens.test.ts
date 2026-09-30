import { describe, expect, it } from 'vitest';

import { hasBearer } from './internal-tokens.ts';

describe('hasBearer', () => {
  const token = 'token-de-teste-com-32-caracteres-ok';

  it('aceita só o token do consumidor, no formato Bearer', () => {
    expect(hasBearer(`Bearer ${token}`, token)).toBe(true);
    expect(hasBearer(`Bearer ${token}x`, token)).toBe(false);
    expect(hasBearer(token, token)).toBe(false);
    expect(hasBearer('Bearer ', token)).toBe(false);
    expect(hasBearer(null, token)).toBe(false);
  });
});
