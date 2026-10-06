import { currentActor } from '@/auth/request-actor.ts';
import { getDb } from '@/db/client.ts';
import { exportSitesTfvars, TFVARS_FILENAME } from '@/domain/sites/sites.ts';
import { problem } from '@/lib/problem.ts';

export const dynamic = 'force-dynamic';

/**
 * Download do sites.auto.tfvars.json (ADR 0011) para a operação versionar na raiz do
 * OpenTofu. Autenticação aqui e papel no domínio: o proxy só redireciona.
 */
export async function GET(): Promise<Response> {
  const actor = await currentActor();
  if (!actor.ok) return problem(401, 'Sessão inválida; entre de novo');
  const file = await exportSitesTfvars(getDb().db, actor.value);
  if (!file.ok) return problem(403, file.issues[0]?.message ?? 'Sem permissão');
  return new Response(file.value, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${TFVARS_FILENAME}"`,
      'cache-control': 'no-store',
    },
  });
}
