// Alvo cloudflare: `wrangler deploy` com o wrangler.jsonc gerado. O ID da versão vem do
// arquivo de saída do wrangler (WRANGLER_OUTPUT_FILE_PATH, entrada `deploy`).
import { execFile } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { ClassifiedError } from '../failures.ts';
import { WRANGLER_BIN } from '../paths.ts';

/** Versão publicada, a partir das linhas NDJSON do arquivo de saída do wrangler. */
export function versionFromOutput(text: string): string | undefined {
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line) as { type?: string; version_id?: string | null };
    if (entry.type === 'deploy' && entry.version_id) return entry.version_id;
  }
  return undefined;
}

export async function deployCloudflare(
  configPath: string,
  credentials: { apiToken: string; accountId: string },
): Promise<string> {
  const output = join(tmpdir(), `wrangler-output-${process.pid}.ndjson`);
  try {
    await promisify(execFile)(WRANGLER_BIN, ['deploy', '--config', configPath], {
      env: {
        ...process.env,
        CLOUDFLARE_API_TOKEN: credentials.apiToken,
        CLOUDFLARE_ACCOUNT_ID: credentials.accountId,
        WRANGLER_OUTPUT_FILE_PATH: output,
        WRANGLER_SEND_METRICS: 'false',
      },
      maxBuffer: 16 * 1024 * 1024,
    });
    const versionId = versionFromOutput(await readFile(output, 'utf8'));
    if (!versionId) throw new ClassifiedError('wrangler deploy não informou a versão', 'transient');
    return versionId;
  } catch (error) {
    if (error instanceof ClassifiedError) throw error;
    const stderr = String((error as { stderr?: string }).stderr ?? error);
    // Credencial ou configuração erradas não se resolvem tentando de novo.
    const permanent =
      /Authentication error|\[code: 10000\]|Invalid .*config|workers\.dev subdomain/i.test(stderr);
    throw new ClassifiedError(
      `wrangler deploy falhou: ${stderr.slice(-2000)}`,
      permanent ? 'permanent' : 'transient',
    );
  } finally {
    await rm(output, { force: true });
  }
}
