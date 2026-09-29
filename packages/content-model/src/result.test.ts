import * as z from 'zod';
import { describe, expect, it } from 'vitest';

import { fail, ok, parseWith } from './result.ts';

describe('parseWith', () => {
  const schema = z.object({ name: z.string().min(1) });

  it('devolve o valor quando o schema aceita', () => {
    expect(parseWith(schema, { name: 'Ana' })).toEqual(ok({ name: 'Ana' }));
  });

  it('devolve os problemas com código prefixado e caminho', () => {
    const result = parseWith(schema, { name: '' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues[0]).toMatchObject({
      code: 'schema.too_small',
      path: ['name'],
    });
  });
});

describe('fail', () => {
  it('monta um resultado com os problemas', () => {
    expect(fail([{ code: 'x', message: 'y', path: [] }])).toEqual({
      ok: false,
      issues: [{ code: 'x', message: 'y', path: [] }],
    });
  });
});
