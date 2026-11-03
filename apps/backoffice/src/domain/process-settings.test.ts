import { afterEach, describe, expect, it, vi } from 'vitest';

// Regressão: no build do Next, o instrumentation configura uma cópia dos módulos do domínio e
// as Server Actions usam outra. Cada `vi.resetModules()` + import dinâmico dá uma cópia nova
// do módulo, como um chunk à parte.

async function freshSchedule() {
  vi.resetModules();
  return import('./builds/schedule.ts');
}

async function freshPublish() {
  vi.resetModules();
  return import('./publications/publish.ts');
}

afterEach(async () => {
  (await freshSchedule()).configureBuildWindow(15 * 60_000);
  (await freshPublish()).configureDailyPublishLimit(3);
});

describe('valores da partida do processo', () => {
  it('a janela configurada numa cópia do módulo vale nas outras', async () => {
    const instrumentation = await freshSchedule();
    instrumentation.configureBuildWindow(30_000);

    const actions = await freshSchedule();

    expect(actions).not.toBe(instrumentation);
    expect(actions.effectiveBuildWindowMs(null)).toBe(30_000);
    expect(actions.effectiveBuildWindowMs(120)).toBe(120_000);
  });

  it('o limite diário configurado numa cópia do módulo vale nas outras', async () => {
    const instrumentation = await freshPublish();
    instrumentation.configureDailyPublishLimit(10);

    const actions = await freshPublish();

    expect(actions).not.toBe(instrumentation);
    expect(actions.effectiveDailyPublishLimit(null)).toBe(10);
    expect(actions.effectiveDailyPublishLimit(1)).toBe(1);
  });
});
