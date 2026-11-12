'use server';

import type { Issue } from '@orakel/content-model';
import { revalidatePath } from 'next/cache';

import { currentActor } from '@/auth/request-actor.ts';
import type { EntityFormResult } from '@/components/editorial/EntityForms';
import { getDb } from '@/db/client.ts';
import {
  enqueueGeneration,
  type GenerationRequest,
  type GenerationRunSummary,
  listGenerationRuns,
} from '@/domain/generation/runs.ts';

// Ações da aba Geração (R1): permissão (content.write), tema vazio, autor de fora e site sem
// contexto editorial ficam no domínio, que cria a execução e o job na mesma transação; aqui só
// a tradução do Result, como em `editorial-actions.ts`. O valor chega do formulário sem tipo
// garantido; o domínio confere.

function refused(issues: readonly Issue[]): EntityFormResult {
  return {
    ok: false,
    message: 'Não foi possível disparar a geração.',
    issues: issues.map((issue) => ({
      path: issue.path.map((key) => (typeof key === 'number' ? key : String(key))),
      message: issue.message,
    })),
  };
}

/** Dispara a geração de um artigo sobre o tema, em nome do autor do site. */
export async function enqueueGenerationAction(
  siteId: string,
  value: unknown,
): Promise<EntityFormResult> {
  const actor = await currentActor();
  if (!actor.ok) return { ok: false, message: 'Sessão inválida; entre de novo.', issues: [] };
  const request = (value ?? {}) as GenerationRequest;
  const result = await getDb().db.transaction((tx) =>
    enqueueGeneration(tx, actor.value, siteId, request),
  );
  if (!result.ok) return refused(result.issues);
  revalidatePath(`/sites/${siteId}/geracao`);
  return { ok: true, message: 'Geração enfileirada: acompanhe a execução na lista.' };
}

/**
 * Leitura do polling da lista de execuções (#779): as execuções do site pelo domínio, que confere
 * site.read; `null` sem sessão ou permissão, e a lista na tela fica como está. Mesmo molde de
 * `siteActivityAction`.
 */
export async function generationRunsAction(siteId: string): Promise<GenerationRunSummary[] | null> {
  const actor = await currentActor();
  if (!actor.ok) return null;
  const result = await listGenerationRuns(getDb().db, actor.value, siteId);
  return result.ok ? result.value : null;
}
