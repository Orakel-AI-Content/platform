import type { Issue } from '../../../result.ts';
import type { Content } from '../../entities/index.ts';

const CODE = 'semantic.unique-block-n';

/**
 * `n` único no artigo. Ele entra no identificador de reconciliação de afiliados; um `n`
 * repetido faz cliques e conversões apontarem para o bloco errado sem erro visível.
 * (Nunca reutilizar um `n` removido é garantido pelo Backoffice, que atribui o número.)
 */
export function checkUniqueBlockN(content: Content, basePath: PropertyKey[] = []): Issue[] {
  const seen = new Set<number>();
  const issues: Issue[] = [];
  content.blocks.forEach((block, i) => {
    if (seen.has(block.n)) {
      issues.push({
        code: CODE,
        message: `Número de bloco ${block.n} repetido no conteúdo ${content.id}`,
        path: [...basePath, 'blocks', i, 'n'],
      });
    }
    seen.add(block.n);
  });
  return issues;
}
