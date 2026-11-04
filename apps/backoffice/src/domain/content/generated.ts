import type { Result } from '@orakel/content-model';

import type { Db } from '../../db/client.ts';
import type { Actor } from '../access/rbac.ts';
import { resourcesFor, siteExists } from '../sites/sites.ts';
import { createContent, submitForReview, type ContentEdit } from './contents.ts';

/**
 * Conteúdo do gerador (rota interna): cria a versão 1 e a envia para revisão na mesma
 * transação, validada como na tela (`createContent`, recursos da release do site). Quem
 * chama passa o `GENERATOR_ACTOR`, que não aprova nem publica: o conteúdo sempre termina
 * `em_revisao`, à espera de uma pessoa.
 */
export async function createForReview(
  db: Db,
  actor: Actor,
  siteId: string,
  input: ContentEdit,
): Promise<Result<{ id: number; version: number }>> {
  return db.transaction(async (tx) => {
    if (!(await siteExists(tx, siteId))) {
      return {
        ok: false,
        issues: [{ code: 'site.not_found', message: `Site ${siteId} não encontrado`, path: [] }],
      };
    }
    const created = await createContent(tx, actor, siteId, input, {
      resources: await resourcesFor(tx, siteId),
    });
    if (!created.ok) return created;
    const submitted = await submitForReview(tx, actor, siteId, created.value.id);
    // A versão 1 acabou de nascer em rascunho: a recusa aqui é invariante quebrada, e o
    // throw desfaz a criação (nenhum rascunho do gerador fica fora da fila).
    if (!submitted.ok) throw new Error(`Envio para revisão recusado: ${submitted.issues[0]?.code}`);
    return { ok: true, value: { id: created.value.id, version: submitted.value.version } };
  });
}
