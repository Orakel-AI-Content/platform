// Alvo cloudflare: `wrangler deploy` com o wrangler.jsonc gerado. O ID da versão vem do
// arquivo de saída do wrangler (WRANGLER_OUTPUT_FILE_PATH, entrada `deploy`).
// `wrangler rollback` (ADR 0009) ativa uma versão já publicada pelo nome do Worker.
import { execFile } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { ClassifiedError } from '../failures.ts';
import { WRANGLER_BIN } from '../paths.ts';
import { workerName } from '../wrangler/targets.ts';

type Credentials = { apiToken: string; accountId: string };

/** O token só entra no env do processo do wrangler; nunca vai para argv, log ou arquivo. */
function wranglerEnv(credentials: Credentials, extra: Record<string, string> = {}) {
  return {
    ...process.env,
    CLOUDFLARE_API_TOKEN: credentials.apiToken,
    CLOUDFLARE_ACCOUNT_ID: credentials.accountId,
    WRANGLER_SEND_METRICS: 'false',
    ...extra,
  };
}

/** Falha do wrangler: credencial ou configuração erradas não se resolvem tentando de novo. */
export function wranglerFailure(command: string, error: unknown): ClassifiedError {
  const stderr = String((error as { stderr?: string }).stderr ?? error);
  const permanent =
    /Authentication error|\[code: 10000\]|Invalid .*config|workers\.dev subdomain/i.test(stderr);
  return new ClassifiedError(
    `wrangler ${command} falhou: ${stderr.slice(-2000)}`,
    permanent ? 'permanent' : 'transient',
  );
}

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
  credentials: Credentials,
): Promise<string> {
  const output = join(tmpdir(), `wrangler-output-${process.pid}.ndjson`);
  try {
    await promisify(execFile)(WRANGLER_BIN, ['deploy', '--config', configPath], {
      env: wranglerEnv(credentials, { WRANGLER_OUTPUT_FILE_PATH: output }),
      maxBuffer: 16 * 1024 * 1024,
    });
    const versionId = versionFromOutput(await readFile(output, 'utf8'));
    if (!versionId) throw new ClassifiedError('wrangler deploy não informou a versão', 'transient');
    return versionId;
  } catch (error) {
    if (error instanceof ClassifiedError) throw error;
    throw wranglerFailure('deploy', error);
  } finally {
    await rm(output, { force: true });
  }
}

/**
 * Ativa `versionId` no Worker do site. Sem `--config`: o rollback roda sem render no volume,
 * e o nome do Worker é determinístico. `bin` é parâmetro para o teste usar um wrangler
 * simulado. Com sucesso, a versão ativa é a pedida.
 */
export async function rollbackCloudflare(
  site: string,
  versionId: string,
  credentials: Credentials,
  bin: string = WRANGLER_BIN,
): Promise<string> {
  const args = ['rollback', versionId, '--name', workerName(site)];
  args.push('--message', `Rollback de ${site} para ${versionId} pelo backoffice`, '--yes');
  try {
    await promisify(execFile)(bin, args, {
      env: wranglerEnv(credentials),
      maxBuffer: 16 * 1024 * 1024,
    });
    return versionId;
  } catch (error) {
    throw wranglerFailure('rollback', error);
  }
}
