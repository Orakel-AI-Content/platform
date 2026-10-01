// Alvo local: `PUT /sites/{site}/versions` na API de administração do edge-local, com a
// saída compactada (12.0, L3). Resposta: { id } da versão, que passa a ser servida.
import { readFile } from 'node:fs/promises';

import { EdgeLocalVersionSchema } from '@orakel/build-contract';
import { ClassifiedError } from '../failures.ts';

export async function uploadEdgeLocal(
  baseUrl: string,
  site: string,
  archive: string,
): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, '')}/sites/${encodeURIComponent(site)}/versions`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/gzip' },
      body: await readFile(archive),
    });
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
  const parsed = EdgeLocalVersionSchema.safeParse(await response.json());
  if (!parsed.success)
    throw new ClassifiedError('edge-local respondeu sem o id da versão', 'transient');
  return parsed.data.id;
}
