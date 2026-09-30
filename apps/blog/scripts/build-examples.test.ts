import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { differences, fingerprint } from './build-examples.ts';

describe('idempotência', () => {
  it('aponta arquivos diferentes, novos e ausentes', () => {
    const [a, b] = [mkdtempSync(join(tmpdir(), 'a-')), mkdtempSync(join(tmpdir(), 'b-'))];
    try {
      writeFileSync(join(a, 'igual.html'), 'x');
      writeFileSync(join(b, 'igual.html'), 'x');
      writeFileSync(join(a, 'muda.html'), '1');
      writeFileSync(join(b, 'muda.html'), '2');
      writeFileSync(join(a, 'so-a.txt'), '');
      expect(differences(fingerprint(a), fingerprint(b))).toEqual(['muda.html', 'so-a.txt']);
    } finally {
      rmSync(a, { recursive: true });
      rmSync(b, { recursive: true });
    }
  });
});
