import type { Issue, Result } from '@orakel/content-model';
import { and, desc, eq } from 'drizzle-orm';

import type { Db } from '../../db/client.ts';
import { contents, contentVersions } from '../../db/schema/index.ts';
import type { Actor } from '../access/rbac.ts';
import { pendingReturn } from '../reviews/reviews.ts';
import { resourcesFor, siteExists } from '../sites/sites.ts';
import { createContent, submitForReview, updateContent, type ContentEdit } from './contents.ts';

const siteNotFound = (siteId: string): Issue => ({
  code: 'site.not_found',
  message: `Site ${siteId} não encontrado`,
  path: [],
});

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
      return { ok: false, issues: [siteNotFound(siteId)] };
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

/**
 * Versão corrigida pelo gerador (correção automática, #799): grava a N+1 do conteúdo devolvido
 * e a envia para revisão na mesma transação, validada como na tela (recursos da release do
 * site). A linha de `contents` fica travada antes da guarda, para um salvar do editor não
 * entrar entre a guarda e a gravação. A guarda exige que `baseVersion` seja a versão mais
 * recente, esteja em `rascunho` e seja a da devolução pendente (`pendingReturn`); senão recusa
 * com `content.base_outdated` e nada é gravado: a edição do editor prevalece. Conteúdo igual
 * ao da base é `content.unchanged`, porque reenviar a base levaria à fila a versão devolvida,
 * sem correção e com a autoria do editor.
 */
export async function correctForReview(
  db: Db,
  actor: Actor,
  siteId: string,
  contentId: number,
  baseVersion: number,
  input: ContentEdit,
): Promise<Result<{ id: number; version: number }>> {
  return db.transaction(async (tx) => {
    if (!(await siteExists(tx, siteId))) return { ok: false, issues: [siteNotFound(siteId)] };

    const [content] = await tx
      .select({ id: contents.id })
      .from(contents)
      .where(and(eq(contents.siteId, siteId), eq(contents.id, contentId)))
      .for('update');
    const [latest] = await tx
      .select({ version: contentVersions.version, status: contentVersions.status })
      .from(contentVersions)
      .where(and(eq(contentVersions.siteId, siteId), eq(contentVersions.contentId, contentId)))
      .orderBy(desc(contentVersions.version))
      .limit(1);
    if (content === undefined || latest === undefined) {
      return {
        ok: false,
        issues: [
          {
            code: 'content.not_found',
            message: `Conteúdo ${contentId} não encontrado no site ${siteId}`,
            path: [],
          },
        ],
      };
    }
    const returned = await pendingReturn(tx, actor, siteId, contentId);
    if (!returned.ok) return returned;
    if (
      latest.version !== baseVersion ||
      latest.status !== 'rascunho' ||
      returned.value?.version !== baseVersion
    ) {
      return {
        ok: false,
        issues: [
          {
            code: 'content.base_outdated',
            message: `A versão ${baseVersion} não é mais a devolução pendente: a mais recente é a ${latest.version}, ${latest.status}`,
            path: ['baseVersion'],
          },
        ],
      };
    }

    const updated = await updateContent(
      tx,
      actor,
      siteId,
      contentId,
      input,
      await resourcesFor(tx, siteId),
    );
    if (!updated.ok) return updated;
    if (!updated.value.created) {
      return {
        ok: false,
        issues: [
          {
            code: 'content.unchanged',
            message: `O conteúdo corrigido é igual ao da versão ${baseVersion}`,
            path: [],
          },
        ],
      };
    }
    const submitted = await submitForReview(tx, actor, siteId, contentId);
    // A N+1 acabou de nascer em rascunho: a recusa aqui é invariante quebrada, e o throw
    // desfaz a gravação (nenhuma versão do gerador fica fora da fila).
    if (!submitted.ok) throw new Error(`Envio para revisão recusado: ${submitted.issues[0]?.code}`);
    return { ok: true, value: { id: contentId, version: submitted.value.version } };
  });
}
