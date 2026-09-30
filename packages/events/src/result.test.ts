import * as z from 'zod';
import { describe, expect, it } from 'vitest';

import { fail, ok, parseWith } from './result.ts';

describe('Result', () => {
  const schema = z.object({ name: z.string().min(1) });

  it('parseWith devolve o valor ou os problemas com código prefixado', () => {
    expect(parseWith(schema, { name: 'Ana' })).toEqual(ok({ name: 'Ana' }));
    const result = parseWith(schema, { name: '' });
    expect(!result.ok && result.issues[0]).toMatchObject({
      code: 'schema.too_small',
      path: ['name'],
    });
  });

  it('fail monta um resultado com os problemas', () => {
    expect(fail([{ code: 'x', message: 'y', path: [] }])).toEqual({
      ok: false,
      issues: [{ code: 'x', message: 'y', path: [] }],
    });
  });
});
