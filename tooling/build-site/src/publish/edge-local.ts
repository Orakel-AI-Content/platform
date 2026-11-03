// Alvo local: `PUT /sites/{site}/versions` na API de administração do edge-local, com a
// saída compactada (12.0, L3). Resposta: { id } da versão, que passa a ser servida.
// Rollback (ADR 0009): `POST /sites/{site}/rollback` com { id } → { active }.
import { readFile } from 'node:fs/promises';

import { EdgeLocalRollbackSchema, EdgeLocalVersionSchema } from '@orakel/build-contract';
import { ClassifiedError } from '../failures.ts';

const siteUrl = (baseUrl: string, site: string, path: string) =>
  `${baseUrl.replace(/\/$/, '')}/sites/${encodeURIComponent(site)}/${path}`;

async function call(url: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new ClassifiedError(`edge-local indisponível: ${(error as Error).message}`, 'transient');
  }
  if (!response.ok) {
    const kind = response.status >= 500 || response.status === 429 ? 'transient' : 'permanent';
    throw new ClassifiedError(
      `edge-local respondeu ${response.status}: ${await response.text()}`,
      kind,
    );
  }
  return response;
}

export async function uploadEdgeLocal(
  baseUrl: string,
  site: string,
  archive: string,
): Promise<string> {
  const response = await call(siteUrl(baseUrl, site, 'versions'), {
    method: 'PUT',
    headers: { 'content-type': 'application/gzip' },
    body: await readFile(archive),
  });
  const parsed = EdgeLocalVersionSchema.safeParse(await response.json());
  if (!parsed.success)
    throw new ClassifiedError('edge-local respondeu sem o id da versão', 'transient');
  return parsed.data.id;
}

/** Ativa `versionId` no edge-local; 404 (versão ou site inexistente) e 400 são permanentes. */
export async function rollbackEdgeLocal(
  baseUrl: string,
  site: string,
  versionId: string,
): Promise<string> {
  const response = await call(siteUrl(baseUrl, site, 'rollback'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: versionId }),
  });
  const parsed = EdgeLocalRollbackSchema.safeParse(await response.json());
  if (!parsed.success)
    throw new ClassifiedError('edge-local respondeu sem a versão ativa', 'transient');
  if (parsed.data.active !== versionId) {
    throw new ClassifiedError(
      `edge-local ativou ${parsed.data.active} em vez de ${versionId}`,
      'transient',
    );
  }
  return parsed.data.active;
}
