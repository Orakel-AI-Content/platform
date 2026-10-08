import { currentActor } from '@/auth/request-actor.ts';
import { getDb } from '@/db/client.ts';
import { FILE_NAME_HEADER, receiveUpload } from '@/domain/media/upload.ts';
import { getEnv } from '@/env.ts';
import { problem } from '@/lib/problem.ts';
import { createS3Client, s3ObjectStore } from '@/lib/s3.ts';

export const dynamic = 'force-dynamic';

/** Status de cada recusa do domínio; o que não estiver aqui é 400. */
const STATUS: Record<string, number> = {
  forbidden: 403,
  'site.not_found': 404,
  'media.length_required': 411,
  'media.too_large': 413,
  'media.unsupported_type': 415,
};

let store: ReturnType<typeof s3ObjectStore> | undefined;

/**
 * Envio de uma imagem (12.0, L4): o arquivo vem cru no corpo, em streaming (route handler
 * não tem o limite de 1 MB das Server Actions), e a ingestão segue no backoffice-worker.
 * Autenticação aqui e papel no domínio: o proxy só redireciona.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ site: string }> },
): Promise<Response> {
  const actor = await currentActor();
  if (!actor.ok) return problem(401, 'Sessão inválida; entre de novo');
  const { site } = await context.params;
  store ??= s3ObjectStore(createS3Client(getEnv()));
  const result = await receiveUpload({ db: getDb().db, store }, actor.value, site, {
    contentLength: request.headers.get('content-length'),
    // Nome original (#184), codificado com encodeURIComponent; o domínio decodifica e valida.
    fileName: request.headers.get(FILE_NAME_HEADER),
    body: request.body,
  });
  if (!result.ok) {
    const [issue] = result.issues;
    return problem(
      STATUS[issue?.code ?? ''] ?? 400,
      issue?.message ?? 'Envio recusado',
      result.issues,
    );
  }
  return Response.json(result.value, { status: 202, headers: { 'cache-control': 'no-store' } });
}
