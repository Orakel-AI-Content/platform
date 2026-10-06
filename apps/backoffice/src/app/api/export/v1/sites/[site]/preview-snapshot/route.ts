import { hasBearer } from '../../../../../../../auth/internal-tokens.ts';
import { getDb } from '../../../../../../../db/client.ts';
import { openSnapshot } from '../../../../../../../domain/export/snapshot.ts';
import { getEnv } from '../../../../../../../env.ts';
import { problem } from '../../../../../../../lib/problem.ts';

export const dynamic = 'force-dynamic';

/**
 * Snapshot do site para a visualização SSR, no mesmo NDJSON do build, com a versão mais
 * recente de cada conteúdo (rascunhos inclusive, ADR 0009). Só na rede interna (o hostname
 * público bloqueia /api/export), com o token da visualização.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ site: string }> },
): Promise<Response> {
  if (!hasBearer(request.headers.get('authorization'), getEnv().EXPORT_PREVIEW_TOKEN)) {
    return problem(401, 'Token de exportação inválido');
  }
  const { site } = await context.params;
  const snapshot = await openSnapshot(getDb().db, site, 'latest');
  if (!snapshot.ok) return problem(404, 'Site não encontrado');
  return new Response(snapshot.value, {
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' },
  });
}
