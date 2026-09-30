// Instâncias locais dos Workers pela API do wrangler (unstable_startWorker), o mesmo motor
// do `wrangler dev` (ADR 0002 da unidade). Todas usam o mesmo registro de dev: é por ele que
// o binding EVENTS dos sites encontra o Worker ae-sim pelo nome.
import { unstable_startWorker } from 'wrangler';

export type Instance = { url: URL; dispose: () => Promise<void> };
export type Runtime = { start: (configPath: string) => Promise<Instance> };

export const START_TIMEOUT_MS = 30_000;

export class StartError extends Error {
  override readonly name = 'StartError';
}

export function wranglerRuntime(registry: string): Runtime {
  return {
    async start(configPath) {
      const worker = await unstable_startWorker({
        config: configPath,
        dev: {
          server: { hostname: '127.0.0.1', port: 0 },
          inspector: false,
          watch: false,
          logLevel: 'warn',
          registry,
        },
      });
      let timer: NodeJS.Timeout | undefined;
      try {
        // Binding para um serviço que não existe faz o wrangler esperar para sempre.
        await Promise.race([
          worker.ready,
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new StartError(`Worker não ficou pronto em ${START_TIMEOUT_MS} ms`)),
              START_TIMEOUT_MS,
            );
          }),
        ]);
        return { url: await worker.url, dispose: () => worker.dispose() };
      } catch (error) {
        await worker.dispose().catch(() => undefined);
        throw error instanceof StartError ? error : new StartError(String(error));
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
