import { z } from 'zod';

import { hasBearer } from '@/auth/internal-tokens.ts';
import { getDb } from '@/db/client.ts';
import { GENERATOR_ACTOR } from '@/domain/access/rbac.ts';
import type { ContentEdit } from '@/domain/content/contents.ts';
import { correctForReview } from '@/domain/content/generated.ts';
import { parseInput } from '@/domain/content/write.ts';
import { getEnv } from '@/env.ts';
import { problem } from '@/lib/problem.ts';

export const dynamic = 'force-dynamic';

const ContentId = z.coerce.number().int().positive();

// Só o envelope: o conteúdo em si é validado pelo domínio, com a mesma regra da tela.
const Body = z.object({
  siteId: z.string().min(1),
  baseVersion: z.number().int().positive(),
  content: z.looseObject({ blocks: z.array(z.looseObject({})) }),
});

const NOT_FOUND = new Set(['site.not_found', 'content.not_found']);

/**
 * Versão corrigida pelo gerador (correção automática), na rede interna (o hostname público
 * bloqueia /api/internal), com o token do gerador. Grava a N+1 do conteúdo devolvido já
 * `em_revisao` em nome do `GENERATOR_ACTOR`, que não aprova nem publica (RN-GEN-02). A
 * `baseVersion` precisa ser a devolução pendente; se o editor já mexeu, 409 e nada é gravado.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!hasBearer(request.headers.get('authorization'), getEnv().GENERATOR_TOKEN)) {
    return problem(401, 'Token do gerador inválido');
  }

  const id = ContentId.safeParse((await context.params).id);
  if (!id.success) return problem(400, 'Id de conteúdo inválido');

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return problem(400, 'Corpo não é JSON');
  }
  const body = parseInput(Body, json);
  if (!body.ok) return problem(400, 'Corpo inválido', body.issues);

  const { siteId, baseVersion, content } = body.value;
  const result = await correctForReview(
    getDb().db,
    GENERATOR_ACTOR,
    siteId,
    id.data,
    baseVersion,
    content as unknown as ContentEdit,
  );
  if (!result.ok) {
    const codes = result.issues.map((issue) => issue.code);
    if (codes.some((code) => NOT_FOUND.has(code))) {
      return problem(404, 'Site ou conteúdo não encontrado');
    }
    if (codes.includes('content.base_outdated')) {
      return problem(409, 'Versão-base desatualizada', result.issues);
    }
    return problem(422, 'Conteúdo inválido', result.issues);
  }
  return Response.json(result.value, { status: 201, headers: { 'cache-control': 'no-store' } });
}
