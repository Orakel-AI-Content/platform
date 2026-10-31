import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { EXPORTED_TABLES } from './record.ts';

// Toda gravação num dado que vai para um site registra a mudança pendente na mesma
// transação. Este teste varre os módulos de domínio: quem grava numa tabela exportada e
// não chama recordPendingChange quebra o CI.

const domainDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : [];
  });
}

/**
 * Gravam só colunas de uma tabela exportada que não vão para o snapshot: o estado do site e o
 * `status` da versão na revisão e no agendamento da publicação (ADR 0015 e 0017 da unidade:
 * `agendado` e a volta a `aprovado` não mudam o snapshot; a mudança pendente nasce no job do
 * horário marcado). Gerar mudança pendente ali agendaria um build sem diferença.
 */
const OPERATIONAL_ONLY = [
  path.join('builds', 'site-state.ts'),
  path.join('reviews', 'reviews.ts'),
  path.join('publications', 'schedule.ts'),
];

const writes = new RegExp(`\\.(?:insert|update|delete)\\((?:${EXPORTED_TABLES.join('|')})\\)`);

describe('mudanças pendentes', () => {
  const files = sourceFiles(domainDir).filter(
    (file) =>
      !file.includes(`${path.sep}pending-changes${path.sep}`) &&
      !OPERATIONAL_ONLY.includes(path.relative(domainDir, file)),
  );

  it('existem módulos de gravação para conferir', () => {
    expect(files.filter((file) => writes.test(readFileSync(file, 'utf8'))).length).toBeGreaterThan(
      5,
    );
  });

  it.each(files.map((file) => [path.relative(domainDir, file), file]))(
    '%s chama recordPendingChange se grava numa tabela exportada',
    (_, file) => {
      const source = readFileSync(file, 'utf8');
      if (writes.test(source)) expect(source).toContain('recordPendingChange(');
    },
  );
});
