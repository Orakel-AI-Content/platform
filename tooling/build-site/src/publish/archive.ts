// Saída compactada do build (artefato + wrangler.jsonc do alvo): vai para o edge-local e
// para o bucket build-cache.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { PATHS } from '../contract.ts';

export async function archiveBuild(buildDir: string, wranglerFile: string, file: string) {
  await promisify(execFile)('tar', ['-czf', file, '-C', buildDir, PATHS.site, wranglerFile]);
}
