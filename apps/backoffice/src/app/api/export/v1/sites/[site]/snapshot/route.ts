import { hasBearer } from '../../../../../../../auth/internal-tokens.ts';
import { getDb } from '../../../../../../../db/client.ts';
import { openSnapshot } from '../../../../../../../domain/export/snapshot.ts';
import { getEnv } from '../../../../../../../env.ts';
import { problem } from '../../../../../../../lib/problem.ts';

export const dynamic = 'force-dynamic';

/**
 * Snapshot do site para o build (render do site-builder), em NDJSON: header, entidades,
 * end. Só na rede interna (o hostname público bloqueia /api/export), com o token do build.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ site: string }> },
): Promise<Response> {
  if (!hasBearer(request.headers.get('authorization'), getEnv().EXPORT_BUILD_TOKEN)) {
    return problem(401, 'Token de exportação inválido');
  }
  const { site } = await context.params;
  const snapshot = await openSnapshot(getDb().db, site);
  if (!snapshot.ok) return problem(404, 'Site não encontrado');
  return new Response(snapshot.value, {
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' },
  });
}
