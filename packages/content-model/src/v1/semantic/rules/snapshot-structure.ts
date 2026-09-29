import { fail, ok, type Issue, type Result } from '../../../result.ts';
import { ENTITY_TYPES, type EndLine, type SnapshotLine } from '../../snapshot.ts';
import type { Snapshot } from '../types.ts';

const CODE = 'semantic.snapshot-structure';

/**
 * Monta o snapshot a partir das linhas: `header` primeiro, `end` por último, uma única
 * `config` e as contagens do `end` iguais às linhas recebidas (senão o snapshot foi cortado).
 */
export function assembleSnapshot(lines: readonly SnapshotLine[]): Result<Snapshot> {
  const issues: Issue[] = [];
  const first = lines[0];
  const last = lines.at(-1);

  if (first?.type !== 'header') {
    issues.push({ code: CODE, message: 'A primeira linha precisa ser o header', path: [0] });
  }
  if (last?.type !== 'end' || lines.length < 2) {
    issues.push({
      code: CODE,
      message: 'A última linha precisa ser o end',
      path: [lines.length - 1],
    });
  }

  const snapshot: Omit<Snapshot, 'header' | 'config'> &
    Partial<Pick<Snapshot, 'header' | 'config'>> = {
    authors: [],
    taxonomies: [],
    menus: [],
    media: [],
    redirects: [],
    contents: [],
  };
  const counts = Object.fromEntries(ENTITY_TYPES.map((type) => [type, 0])) as EndLine['counts'];

  lines.forEach((line, index) => {
    switch (line.type) {
      case 'header':
        if (index !== 0)
          issues.push({ code: CODE, message: 'Header fora da primeira linha', path: [index] });
        snapshot.header = line;
        return;
      case 'end':
        if (index !== lines.length - 1) {
          issues.push({ code: CODE, message: 'End fora da última linha', path: [index] });
        }
        return;
      case 'config':
        if (snapshot.config !== undefined) {
          issues.push({ code: CODE, message: 'Mais de uma linha de config', path: [index] });
        }
        snapshot.config = line.data;
        break;
      case 'author':
        snapshot.authors.push(line.data);
        break;
      case 'taxonomy':
        snapshot.taxonomies.push(line.data);
        break;
      case 'menu':
        snapshot.menus.push(line.data);
        break;
      case 'media':
        snapshot.media.push(line.data);
        break;
      case 'redirect':
        snapshot.redirects.push(line.data);
        break;
      case 'content':
        snapshot.contents.push(line.data);
        break;
    }
    counts[line.type] += 1;
  });

  if (snapshot.config === undefined) {
    issues.push({ code: CODE, message: 'O snapshot não tem a linha de config', path: [] });
  }
  if (last?.type === 'end') {
    for (const type of ENTITY_TYPES) {
      if (last.counts[type] !== counts[type]) {
        issues.push({
          code: CODE,
          message: `Contagem de ${type} diverge do end (esperado ${last.counts[type]}, recebido ${counts[type]}): snapshot cortado?`,
          path: [lines.length - 1, 'counts', type],
        });
      }
    }
  }

  const { header, config } = snapshot;
  if (issues.length > 0 || header === undefined || config === undefined) return fail(issues);
  return ok({ ...snapshot, header, config });
}
