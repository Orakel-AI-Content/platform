import type { Result } from '@orakel/content-model';
import type { Content } from '@orakel/content-model/v1';

import type { Executor } from '../../db/client.ts';
import { contents, contentVersions, type CONTENT_STATUSES } from '../../db/schema/index.ts';
import { allocateId } from '../../db/site-ids.ts';
import type { Actor } from '../access/rbac.ts';
import { recordPendingChange } from '../pending-changes/record.ts';
import { checkWrite, type WriteOptions } from './write.ts';

type Status = (typeof CONTENT_STATUSES)[number];

/**
 * Cria um conteúdo com a versão 1. `publicado` exige também permissão de publicar. O
 * próximo número de bloco fica acima do maior `n` usado (nunca reutilizado). O fluxo de
 * revisão, aprovação, agendamento e o limite diário entram com o módulo Publicação.
 */
export async function createContent(
  tx: Executor,
  actor: Actor,
  siteId: string,
  input: Omit<Content, 'id'>,
  options: WriteOptions & { status?: Status } = {},
): Promise<Result<{ id: number }>> {
  const status = options.status ?? 'rascunho';
  const allowed = checkWrite(actor);
  if (!allowed.ok) return allowed;
  if (status === 'publicado') {
    const publish = checkWrite(actor, 'content.publish');
    if (!publish.ok) return publish;
  }

  const id = await allocateId(tx, siteId, 'content', options.id);
  const nextBlockN = Math.max(0, ...input.blocks.map((block) => block.n)) + 1;
  await tx.insert(contents).values({ siteId, id, kind: input.kind, nextBlockN });
  await tx
    .insert(contentVersions)
    .values({ siteId, contentId: id, version: 1, status, data: input });
  await recordPendingChange(tx, siteId, 'content', String(id));
  return { ok: true, value: { id } };
}
