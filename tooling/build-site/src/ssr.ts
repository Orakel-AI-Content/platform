// ssr: servidor da visualização (blog-preview), o build `preview` do blog feito na
// construção da imagem. Valida o ambiente antes de subir e repassa os sinais de parada.
import { spawn } from 'node:child_process';

import { EXIT_CODES } from '@orakel/build-contract';
import { SsrEnvSchema, parseEnv } from './env.ts';
import { classify } from './failures.ts';
import { BLOG_PREVIEW_ENTRY } from './paths.ts';

function startServer(env: NodeJS.ProcessEnv): Promise<number> {
  const child = spawn(process.execPath, [BLOG_PREVIEW_ENTRY], {
    stdio: 'inherit',
    env: { HOST: '0.0.0.0', ...env },
  });
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => child.kill(signal));
  }
  return new Promise((resolve) => child.on('exit', (code) => resolve(code ?? 1)));
}

/** Sem ambiente válido, sai com o código da falha (permanente) sem subir o servidor. */
export function ssr(
  env: NodeJS.ProcessEnv = process.env,
  start: (env: NodeJS.ProcessEnv) => Promise<number> = startServer,
): Promise<number> {
  try {
    parseEnv(SsrEnvSchema, env, 'ssr');
  } catch (error) {
    const failure = classify(error);
    console.log(JSON.stringify({ msg: 'ssr falhou', ...failure }));
    return Promise.resolve(EXIT_CODES[failure.kind]);
  }
  return start(env);
}
