import { z } from 'zod';

import { hasBearer } from '@/auth/internal-tokens.ts';
import { getDb } from '@/db/client.ts';
import { GENERATOR_ACTOR } from '@/domain/access/rbac.ts';
import type { ContentEdit } from '@/domain/content/contents.ts';
import { createForReview } from '@/domain/content/generated.ts';
import { parseInput } from '@/domain/content/write.ts';
import { getEnv } from '@/env.ts';
import { problem } from '@/lib/problem.ts';

export const dynamic = 'force-dynamic';

// Só o envelope: o conteúdo em si é validado pelo domínio, com a mesma regra da tela.
const Body = z.object({
  siteId: z.string().min(1),
  content: z.looseObject({ blocks: z.array(z.looseObject({})) }),
});

/**
 * Criação de conteúdo pelo gerador, na rede interna (o hostname público bloqueia
 * /api/internal), com o token do gerador. O conteúdo nasce `em_revisao` em nome do
 * `GENERATOR_ACTOR`, que não aprova nem publica (RN-GEN-02).
 */
export async function POST(request: Request): Promise<Response> {
  if (!hasBearer(request.headers.get('authorization'), getEnv().GENERATOR_TOKEN)) {
    return problem(401, 'Token do gerador inválido');
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return problem(400, 'Corpo não é JSON');
  }
  const body = parseInput(Body, json);
  if (!body.ok) return problem(400, 'Corpo inválido', body.issues);

  const { siteId, content } = body.value;
  const result = await createForReview(
    getDb().db,
    GENERATOR_ACTOR,
    siteId,
    content as unknown as ContentEdit,
  );
  if (!result.ok) {
    const notFound = result.issues.some((issue) => issue.code === 'site.not_found');
    return notFound
      ? problem(404, 'Site não encontrado')
      : problem(422, 'Conteúdo inválido', result.issues);
  }
  return Response.json(result.value, { status: 201, headers: { 'cache-control': 'no-store' } });
}
