import { describe, expect, it } from 'vitest';

import { fakeRuntime } from './fake-runtime.ts';

const service = {
  name: 'orakel-preview-1.4.0',
  image: 'ghcr.io/orakel-ai-content/site-builder:1.4.0',
  command: ['ssr'],
  env: {},
  networks: [{ name: 'orakel-internal', aliases: ['blog-preview'] }],
  healthcheck: { test: ['CMD', 'true'], intervalMs: 1000, timeoutMs: 1000, retries: 1 },
  labels: {},
};

describe('fakeRuntime: containers de serviço', () => {
  it('registra o serviço e devolve a saúde da fila, repetindo a última', async () => {
    const fake = fakeRuntime({ health: ['starting', 'healthy'] });
    const id = await fake.runtime.startService(service);
    expect(fake.services).toEqual([service]);
    expect(await fake.runtime.health(id)).toBe('starting');
    expect(await fake.runtime.health(id)).toBe('healthy');
    expect(await fake.runtime.health(id)).toBe('healthy');
  });

  it('container nunca criado ou removido é absent', async () => {
    const fake = fakeRuntime({});
    expect(await fake.runtime.health('nenhum')).toBe('absent');
    const id = await fake.runtime.startService(service);
    expect(await fake.runtime.health(id)).toBe('healthy');
    await fake.runtime.removeContainer(id);
    expect(await fake.runtime.health(id)).toBe('absent');
  });

  it('falha no create ou na leitura quando pedido', async () => {
    await expect(
      fakeRuntime({ failOn: 'startService' }).runtime.startService(service),
    ).rejects.toThrow();
    await expect(fakeRuntime({ failOn: 'health' }).runtime.health('x')).rejects.toThrow();
  });
});
