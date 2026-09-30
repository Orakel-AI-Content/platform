// edge-local: substituto local do deploy na Cloudflare (12.0, L3). Só no ambiente local.
//
//   :8080  sites  — <site>.localhost → Worker ativo do site (via Caddy)
//   :8081  admin  — PUT/GET /sites/{site}/versions, POST /sites/{site}/rollback, /healthz
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { startAdmin } from './admin.ts';
import { clickhouseSink, ndjsonSink } from './ae-sink.ts';
import { readEnv } from './env.ts';
import { startProxy } from './proxy.ts';
import { wranglerRuntime } from './runtime.ts';
import { Store } from './store.ts';
import { Supervisor, type Log } from './supervisor.ts';

const AE_SIM_WORKER = fileURLToPath(new URL('./ae-sim/worker.js', import.meta.url));

export const log: Log = (message) => console.log(JSON.stringify(message));

/** Config do ae-sim gerada na partida: o destino dos pontos depende da porta da administração. */
export async function writeAeSimConfig(dataDir: string, adminPort: number): Promise<string> {
  const dir = join(dataDir, 'ae-sim');
  await mkdir(dir, { recursive: true });
  const file = join(dir, 'wrangler.jsonc');
  await writeFile(
    file,
    JSON.stringify({
      name: 'ae-sim',
      main: AE_SIM_WORKER,
      compatibility_date: '2026-09-22',
      vars: { SINK: `http://127.0.0.1:${adminPort}/_ae-sim/points` },
    }),
  );
  return file;
}

export async function main() {
  const env = readEnv();
  const registry = join(env.EDGE_LOCAL_DATA, 'registry');
  // O registro é de processos vivos: começa vazio a cada partida.
  await rm(registry, { recursive: true, force: true });
  await mkdir(registry, { recursive: true });

  const supervisor = new Supervisor({
    store: new Store(env.EDGE_LOCAL_DATA),
    runtime: wranglerRuntime(registry),
    keep: env.EDGE_LOCAL_KEEP,
    log,
  });
  // A administração sobe antes (o ae-sim grava por ela), mas só fica saudável no fim.
  let ready = false;
  const sink = env.EDGE_LOCAL_CLICKHOUSE_URL
    ? clickhouseSink({
        url: env.EDGE_LOCAL_CLICKHOUSE_URL,
        user: env.EDGE_LOCAL_CLICKHOUSE_USER,
        password: env.EDGE_LOCAL_CLICKHOUSE_PASSWORD,
        database: env.EDGE_LOCAL_CLICKHOUSE_DATABASE,
      })
    : ndjsonSink(env.EDGE_LOCAL_DATA);
  const admin = startAdmin(supervisor, sink, env.EDGE_LOCAL_ADMIN_PORT, log, () => ready);
  await supervisor.startAeSim(
    await writeAeSimConfig(env.EDGE_LOCAL_DATA, env.EDGE_LOCAL_ADMIN_PORT),
  );
  await supervisor.restore();
  const proxy = startProxy(supervisor, env.EDGE_LOCAL_SITE_PORT);
  await new Promise((resolve) => proxy.once('listening', resolve));
  ready = true;
  log({
    msg: 'edge-local no ar',
    sites: env.EDGE_LOCAL_SITE_PORT,
    admin: env.EDGE_LOCAL_ADMIN_PORT,
  });

  const shutdown = () => {
    proxy.close();
    admin.close();
    void supervisor.stop().then(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

if (import.meta.main) await main();
