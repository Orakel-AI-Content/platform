import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// O migrator do Drizzle só aplica o que está no journal. Duas branches que geram a mesma
// migração NNNN se resolvem no merge sem conflito de arquivo, mas o journal fica com uma só e a
// outra nunca roda (#705 e #712): esta guarda pega isso no `pnpm test`.

const folder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle');
const journal = JSON.parse(readFileSync(path.join(folder, 'meta/_journal.json'), 'utf8')) as {
  entries: { idx: number; tag: string; when: number }[];
};
const files = readdirSync(folder)
  .filter((name) => name.endsWith('.sql'))
  .map((name) => name.replace(/\.sql$/, ''))
  .sort();

describe('migrações do Drizzle', () => {
  it('todo arquivo .sql tem entrada no journal, e toda entrada tem arquivo', () => {
    expect(journal.entries.map((e) => e.tag).sort()).toEqual(files);
  });

  it('um número por migração, na ordem do journal e com datas crescentes', () => {
    journal.entries.forEach((entry, i) => {
      expect(entry.idx).toBe(i);
      expect(entry.tag.startsWith(`${String(i).padStart(4, '0')}_`)).toBe(true);
      if (i > 0) expect(entry.when).toBeGreaterThan(journal.entries[i - 1]?.when ?? 0);
    });
  });
});
