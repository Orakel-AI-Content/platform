// ssr: servidor da visualização (blog-preview), o build `preview` do blog feito na
// construção da imagem. Repassa o ambiente e os sinais de parada.
import { spawn } from 'node:child_process';

import { BLOG_PREVIEW_ENTRY } from './paths.ts';

export function ssr(): Promise<number> {
  const child = spawn(process.execPath, [BLOG_PREVIEW_ENTRY], {
    stdio: 'inherit',
    env: { HOST: '0.0.0.0', ...process.env },
  });
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => child.kill(signal));
  }
  return new Promise((resolve) => child.on('exit', (code) => resolve(code ?? 1)));
}
