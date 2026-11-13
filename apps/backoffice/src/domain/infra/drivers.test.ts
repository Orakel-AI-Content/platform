import { describe, expect, it } from 'vitest';

import type { InfraStep } from '../../db/schema/index.ts';
import {
  fakeRuntime,
  infraApplyOk,
  infraDestroyed,
  infraDestroyPlanOk,
  infraFailed,
  infraPlanOk,
  type FakeStage,
} from '../builds/fake-runtime.ts';
import {
  InfraPlanSummarySchema,
  LOCAL_DRIFT_CHANGE,
  LOCAL_NAMESERVERS,
  localDriver,
  planHasChanges,
  readApplyProgress,
  stepOfResourceType,
  stepOrder,
  summarizePlan,
  tofuDriver,
} from './drivers.ts';

const target = {
  runId: 7,
  siteId: 'exemplo-a',
  domain: 'exemplo-a.com.br',
  kind: 'criar' as const,
};
const removal = { ...target, kind: 'remover' as const };
const IMAGE = 'ghcr.io/orakel-ai-content/infra-runner:abc1234';
const ENV = {
  CLOUDFLARE_ACCOUNT_ID: 'f'.repeat(32),
  EMAIL_FORWARD_TO: 'caixa@orakel.example',
  CLOUDFLARE_INFRA_TOKEN: 'segredo-infra',
  TOFU_STATE_ACCESS_KEY_ID: 'segredo-chave',
  TOFU_STATE_SECRET_ACCESS_KEY: 'segredo-acesso',
  TOFU_STATE_PASSPHRASE: 'segredo-senha-do-estado',
};

/** Linha `-json` do tofu para um recurso. */
const hook = (
  type: 'apply_start' | 'apply_complete' | 'apply_errored',
  resource: string,
  action: 'create' | 'delete' = 'create',
) => {
  const [resourceType = '', name = ''] = resource.split('.');
  return JSON.stringify({
    '@level': type === 'apply_errored' ? 'error' : 'info',
    '@message': `module.site.${resource}: ...`,
    type,
    hook: {
      resource: {
        addr: `module.site.${resource}`,
        resource_type: resourceType,
        resource_name: name,
      },
      action,
    },
  });
};

/** Apply completo de um site: zona, DNS, e-mail, regra e bucket, nessa ordem. */
const FULL_APPLY_LOG = [
  '{"@level":"info","type":"version","@message":"OpenTofu 1.10"}',
  hook('apply_start', 'cloudflare_zone.site'),
  hook('apply_complete', 'cloudflare_zone.site'),
  hook('apply_start', 'cloudflare_dns_record.www'),
  hook('apply_start', 'cloudflare_email_routing_settings.site'),
  // Em paralelo, um recurso de etapa anterior não faz a etapa voltar.
  hook('apply_start', 'cloudflare_dns_record.spf'),
  hook('apply_start', 'cloudflare_ruleset.waf'),
  hook('apply_start', 'cloudflare_r2_bucket.media'),
  'infra-runner: aviso no stderr',
].join('\n');

/** Destruição completa de um site, na ordem do tofu: o que depende da zona antes, a zona por último. */
const DESTROY_LOG = [
  '{"@level":"info","type":"version","@message":"OpenTofu 1.10"}',
  hook('apply_start', 'cloudflare_r2_custom_domain.media', 'delete'),
  hook('apply_start', 'cloudflare_r2_bucket.media', 'delete'),
  hook('apply_start', 'cloudflare_ruleset.waf', 'delete'),
  // Em paralelo, um recurso de etapa já passada não faz a etapa voltar.
  hook('apply_start', 'cloudflare_r2_bucket.media', 'delete'),
  hook('apply_start', 'cloudflare_email_routing_rule.alias', 'delete'),
  hook('apply_start', 'cloudflare_dns_record.www', 'delete'),
  hook('apply_start', 'cloudflare_zone.site', 'delete'),
  'infra-runner: aviso no stderr',
].join('\n');

function tofu(stages: { infraPlan?: FakeStage; infraApply?: FakeStage }, image = true) {
  const fake = fakeRuntime({ image, pull: 'ok', ...stages });
  const logs: string[] = [];
  const driver = tofuDriver({
    runtime: fake.runtime,
    image: IMAGE,
    network: 'orakel-publish',
    env: ENV,
    log: (msg) => logs.push(msg),
    timeouts: { planMs: 60_000, applyMs: 60_000, pollMs: 10 },
  });
  return { ...fake, driver, logs };
}

describe('stepOfResourceType', () => {
  it.each([
    ['cloudflare_zone', 'endereco'],
    ['cloudflare_dns_record', 'dns'],
    ['cloudflare_email_routing_rule', 'email'],
    ['cloudflare_email_routing_dns', 'email'],
    ['cloudflare_ruleset', 'regras'],
    ['cloudflare_zone_setting', 'regras'],
    ['cloudflare_tiered_cache', 'regras'],
    ['cloudflare_bot_management', 'regras'],
    ['cloudflare_r2_bucket', 'imagens'],
    ['cloudflare_r2_custom_domain', 'imagens'],
  ])('%s → %s', (type, step) => {
    expect(stepOfResourceType(type)).toBe(step);
  });
});

describe('summarizePlan', () => {
  it('agrupa por etapa e lista toda etapa, mesmo vazia', () => {
    const summary = summarizePlan([
      { address: 'module.site.cloudflare_zone.site', type: 'cloudflare_zone', action: 'create' },
      {
        address: 'module.site.cloudflare_ruleset.waf',
        type: 'cloudflare_ruleset',
        action: 'update',
      },
    ]);
    expect(InfraPlanSummarySchema.parse(summary)).toEqual(summary);
    expect(summary.steps.endereco).toHaveLength(1);
    expect(summary.steps.regras).toEqual([
      {
        address: 'module.site.cloudflare_ruleset.waf',
        type: 'cloudflare_ruleset',
        action: 'update',
      },
    ]);
    expect(summary.steps.dns).toEqual([]);
    expect(summary.steps.imagens).toEqual([]);
  });
});

describe('planHasChanges', () => {
  it('só há mudança quando alguma etapa tem recurso', () => {
    expect(planHasChanges(summarizePlan([]))).toBe(false);
    expect(planHasChanges(summarizePlan([LOCAL_DRIFT_CHANGE]))).toBe(true);
  });
});

describe('readApplyProgress', () => {
  it('a etapa corrente só avança e ignora linhas que não são JSON', () => {
    expect(readApplyProgress(FULL_APPLY_LOG, 'criar')).toEqual({
      current: 'imagens',
      errored: null,
    });
    expect(readApplyProgress('', 'criar')).toEqual({ current: null, errored: null });
  });

  it('aponta a etapa do recurso que falhou', () => {
    const log = [
      hook('apply_start', 'cloudflare_zone.site'),
      hook('apply_start', 'cloudflare_dns_record.spf'),
      hook('apply_start', 'cloudflare_email_routing_rule.alias'),
      hook('apply_errored', 'cloudflare_dns_record.spf'),
    ].join('\n');
    expect(readApplyProgress(log, 'criar')).toEqual({ current: 'email', errored: 'dns' });
  });

  it('na remoção, a etapa corrente avança na ordem inversa', () => {
    expect(stepOrder('remover')).toEqual(['imagens', 'regras', 'email', 'dns', 'endereco']);
    expect(readApplyProgress(DESTROY_LOG, 'remover')).toEqual({
      current: 'endereco',
      errored: null,
    });
  });
});

describe('tofuDriver', () => {
  const changes = [
    { address: 'module.site.cloudflare_zone.site', type: 'cloudflare_zone', action: 'create' },
    {
      address: 'module.site.cloudflare_dns_record.spf',
      type: 'cloudflare_dns_record',
      action: 'create',
    },
  ];

  it('plan: roda o comando no volume da execução e devolve o resumo por etapa', async () => {
    const t = tofu({ infraPlan: { file: infraPlanOk(changes) } });
    const outcome = await t.driver.plan(target);

    expect(outcome).toMatchObject({ status: 'ok' });
    if (outcome.status !== 'ok') return;
    expect(outcome.summary.steps.endereco).toHaveLength(1);
    expect(outcome.summary.steps.dns).toHaveLength(1);
    const [spec] = t.started;
    expect(spec).toMatchObject({
      name: 'orakel-infra-plan-7',
      image: IMAGE,
      command: ['plan'],
      network: 'orakel-publish',
      volume: { name: 'orakel-infra-7', target: '/infra' },
    });
    // O volume guarda o plano salvo até o apply; o container sai.
    expect(t.volumes).toEqual({ created: ['orakel-infra-7'], removed: [] });
    expect(t.removed).toEqual(['orakel-infra-plan-7']);
  });

  it('o container recebe só a entrada do site e os segredos de infra', async () => {
    const t = tofu({ infraPlan: { file: infraPlanOk(changes) } });
    await t.driver.plan(target);
    expect(t.started[0]?.env).toEqual({
      ...ENV,
      SITE_ID: 'exemplo-a',
      DOMAIN: 'exemplo-a.com.br',
    });
  });

  it('plan com falha apaga o volume e o container', async () => {
    const t = tofu({
      infraPlan: { exitCode: 10, file: infraFailed('permanent', 'token inválido') },
    });
    const outcome = await t.driver.plan(target);
    expect(outcome).toEqual({
      status: 'failed',
      failure: { kind: 'permanent', message: 'token inválido' },
    });
    expect(t.volumes.removed).toEqual(['orakel-infra-7']);
    expect(t.removed).toEqual(['orakel-infra-plan-7']);
  });

  it('plan sem arquivo de resultado decide pelo código de saída', async () => {
    const t = tofu({ infraPlan: { exitCode: 20 } });
    expect(await t.driver.plan(target)).toMatchObject({
      status: 'failed',
      failure: { kind: 'transient' },
    });
  });

  it('plan de outro site é recusado', async () => {
    const t = tofu({ infraPlan: { file: infraPlanOk(changes, 'exemplo-b') } });
    expect(await t.driver.plan(target)).toMatchObject({
      status: 'failed',
      failure: { message: 'infra-plan.json inválido ou de outro site' },
    });
  });

  it('site sem domínio falha antes de iniciar o container', async () => {
    const t = tofu({});
    expect(await t.driver.plan({ ...target, domain: '' })).toMatchObject({
      status: 'failed',
      failure: { kind: 'permanent' },
    });
    expect(t.started).toEqual([]);
  });

  it('baixa a imagem que não está no host; recusada pelo registry, falha permanente', async () => {
    const t = tofu({ infraPlan: { file: infraPlanOk(changes) } }, false);
    await t.driver.plan(target);
    expect(t.pulled).toEqual([IMAGE]);

    const denied = fakeRuntime({ image: false, pull: 'unavailable' });
    const driver = tofuDriver({ runtime: denied.runtime, image: IMAGE, network: 'n', env: ENV });
    expect(await driver.plan(target)).toMatchObject({
      status: 'failed',
      failure: { kind: 'permanent' },
    });
    expect(denied.started).toEqual([]);
  });

  const check = { siteId: 'exemplo-a', domain: 'exemplo-a.com.br' };

  it('check: roda o plan num volume e container só da conferência e apaga os dois', async () => {
    const t = tofu({ infraPlan: { file: infraPlanOk(changes) } });
    const outcome = await t.driver.check(check);

    expect(outcome).toMatchObject({ status: 'ok' });
    if (outcome.status !== 'ok') return;
    expect(planHasChanges(outcome.summary)).toBe(true);
    expect(t.started[0]).toMatchObject({
      name: 'orakel-infra-check-exemplo-a',
      command: ['plan'],
      env: { ...ENV, SITE_ID: 'exemplo-a', DOMAIN: 'exemplo-a.com.br' },
      volume: { name: 'orakel-infra-check-exemplo-a', target: '/infra' },
      labels: { 'orakel.infra-check': 'exemplo-a', 'orakel.site': 'exemplo-a' },
    });
    expect(t.volumes).toEqual({
      created: ['orakel-infra-check-exemplo-a'],
      removed: ['orakel-infra-check-exemplo-a'],
    });
    expect(t.removed).toEqual(['orakel-infra-check-exemplo-a']);
  });

  it('check sem mudanças sai em dia', async () => {
    const t = tofu({ infraPlan: { file: infraPlanOk([]) } });
    const outcome = await t.driver.check(check);
    expect(outcome.status === 'ok' && planHasChanges(outcome.summary)).toBe(false);
  });

  it('check com falha também apaga o volume e o container', async () => {
    const t = tofu({
      infraPlan: { exitCode: 10, file: infraFailed('permanent', 'token inválido') },
    });
    expect(await t.driver.check(check)).toEqual({
      status: 'failed',
      failure: { kind: 'permanent', message: 'token inválido' },
    });
    expect(t.volumes.removed).toEqual(['orakel-infra-check-exemplo-a']);
    expect(t.removed).toEqual(['orakel-infra-check-exemplo-a']);
  });

  it('check com erro do runtime vira falha, e o volume sai mesmo assim', async () => {
    const fake = fakeRuntime({ failOn: 'start' });
    const driver = tofuDriver({ runtime: fake.runtime, image: IMAGE, network: 'n', env: ENV });
    expect(await driver.check(check)).toMatchObject({
      status: 'failed',
      failure: { kind: 'transient', message: 'plan: proxy recusou' },
    });
    expect(fake.volumes.removed).toEqual(['orakel-infra-check-exemplo-a']);
  });

  it('apply: grava a etapa de cada recurso na ordem do -json e fecha com os nameservers', async () => {
    const t = tofu({
      infraApply: { file: infraApplyOk(), log: FULL_APPLY_LOG, pendingWaits: 2 },
    });
    const steps: InfraStep[] = [];
    const outcome = await t.driver.apply(target, (step) => {
      steps.push(step);
      return Promise.resolve();
    });

    expect(outcome).toEqual({
      status: 'ok',
      nameservers: ['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com'],
    });
    // O log fixo traz todos os recursos de uma vez: a etapa corrente vai direto à mais adiantada.
    expect(steps).toEqual(['imagens']);
    expect(t.started[0]).toMatchObject({ name: 'orakel-infra-apply-7', command: ['apply'] });
    expect(t.volumes.removed).toEqual(['orakel-infra-7']);
    expect(t.removed).toEqual(['orakel-infra-apply-7']);
  });

  it('apply: o andamento acompanha o log enquanto o container roda', async () => {
    const lines = FULL_APPLY_LOG.split('\n');
    const fake = fakeRuntime({
      image: true,
      infraApply: { file: infraApplyOk(), pendingWaits: 9 },
    });
    // Cada leitura do log mostra mais linhas, como o tofu escrevendo.
    let reads = 0;
    fake.runtime.logsTail = () => Promise.resolve(lines.slice(0, (reads += 1)).join('\n'));
    const driver = tofuDriver({
      runtime: fake.runtime,
      image: IMAGE,
      network: 'orakel-publish',
      env: ENV,
      timeouts: { planMs: 60_000, applyMs: 60_000, pollMs: 10 },
    });
    const steps: InfraStep[] = [];
    await driver.apply(target, (step) => {
      steps.push(step);
      return Promise.resolve();
    });
    expect(steps).toEqual(['endereco', 'dns', 'email', 'regras', 'imagens']);
  });

  it('apply com falha devolve a etapa do recurso que falhou e apaga o volume', async () => {
    const log = [
      hook('apply_start', 'cloudflare_zone.site'),
      hook('apply_start', 'cloudflare_dns_record.spf'),
      hook('apply_errored', 'cloudflare_dns_record.spf'),
    ].join('\n');
    const t = tofu({
      infraApply: {
        exitCode: 10,
        log,
        file: infraFailed('permanent', 'Falha no apply: registro duplicado'),
      },
    });
    const outcome = await t.driver.apply(target, () => Promise.resolve());
    expect(outcome).toEqual({
      status: 'failed',
      step: 'dns',
      failure: { kind: 'permanent', message: 'Falha no apply: registro duplicado' },
    });
    expect(t.volumes.removed).toEqual(['orakel-infra-7']);
    expect(t.removed).toEqual(['orakel-infra-apply-7']);
  });

  it('apply que estoura o prazo é morto, e container e volume saem', async () => {
    const t = tofu({ infraApply: { running: true } });
    const driver = tofuDriver({
      runtime: t.runtime,
      image: IMAGE,
      network: 'orakel-publish',
      env: ENV,
      timeouts: { planMs: 0, applyMs: 0, pollMs: 0 },
    });
    expect(await driver.apply(target, () => Promise.resolve())).toMatchObject({
      status: 'failed',
      step: null,
      failure: { kind: 'transient' },
    });
    expect(t.killed).toEqual(['orakel-infra-apply-7']);
    expect(t.removed).toEqual(['orakel-infra-apply-7']);
    expect(t.volumes.removed).toEqual(['orakel-infra-7']);
  });

  it('erro do runtime no apply vira falha, e o volume sai mesmo assim', async () => {
    const t = fakeRuntime({ image: true, failOn: 'start' });
    const driver = tofuDriver({ runtime: t.runtime, image: IMAGE, network: 'n', env: ENV });
    expect(await driver.apply(target, () => Promise.resolve())).toMatchObject({
      status: 'failed',
      failure: { kind: 'transient', message: 'apply: proxy recusou' },
    });
    expect(t.volumes.removed).toEqual(['orakel-infra-7']);
  });
});

describe('tofuDriver na remoção', () => {
  const deletes = [
    { address: 'module.site.cloudflare_zone.site', type: 'cloudflare_zone', action: 'delete' },
    {
      address: 'module.site.cloudflare_r2_bucket.media',
      type: 'cloudflare_r2_bucket',
      action: 'delete',
    },
  ];

  it('plan: roda o modo destroy e agrupa as remoções por etapa', async () => {
    const t = tofu({ infraPlan: { file: infraDestroyPlanOk(deletes) } });
    const outcome = await t.driver.plan(removal);

    expect(outcome).toMatchObject({ status: 'ok' });
    if (outcome.status !== 'ok') return;
    expect(outcome.summary.steps.endereco).toEqual([deletes[0]]);
    expect(outcome.summary.steps.imagens).toEqual([deletes[1]]);
    expect(t.started[0]?.env).toEqual({
      ...ENV,
      SITE_ID: 'exemplo-a',
      DOMAIN: 'exemplo-a.com.br',
      INFRA_MODE: 'destroy',
    });
    expect(t.volumes).toEqual({ created: ['orakel-infra-7'], removed: [] });
  });

  it('plano de modo diferente do tipo da execução é recusado e o volume sai', async () => {
    const create = tofu({ infraPlan: { file: infraPlanOk(deletes) } });
    expect(await create.driver.plan(removal)).toEqual({
      status: 'failed',
      failure: {
        kind: 'transient',
        message: 'infra-plan.json é de create, a execução é de remover',
      },
    });
    expect(create.volumes.removed).toEqual(['orakel-infra-7']);

    const destroy = tofu({ infraPlan: { file: infraDestroyPlanOk(deletes) } });
    expect(await destroy.driver.plan(target)).toMatchObject({
      status: 'failed',
      failure: { message: 'infra-plan.json é de destroy, a execução é de criar' },
    });
  });

  it('apply: grava as etapas na ordem da destruição e fecha ok sem nameservers', async () => {
    const lines = DESTROY_LOG.split('\n');
    const fake = fakeRuntime({
      image: true,
      infraApply: { file: infraDestroyed(), pendingWaits: 9 },
    });
    let reads = 0;
    fake.runtime.logsTail = () => Promise.resolve(lines.slice(0, (reads += 1)).join('\n'));
    const driver = tofuDriver({
      runtime: fake.runtime,
      image: IMAGE,
      network: 'orakel-publish',
      env: ENV,
      timeouts: { planMs: 60_000, applyMs: 60_000, pollMs: 10 },
    });
    const steps: InfraStep[] = [];
    const outcome = await driver.apply(removal, (step) => {
      steps.push(step);
      return Promise.resolve();
    });

    expect(outcome).toEqual({ status: 'ok', nameservers: [] });
    expect(steps).toEqual(['imagens', 'regras', 'email', 'dns', 'endereco']);
    // O apply não recebe o modo: o infra-runner o lê do plano salvo.
    expect(fake.started[0]?.env).not.toHaveProperty('INFRA_MODE');
    expect(fake.volumes.removed).toEqual(['orakel-infra-7']);
  });

  it('apply com falha devolve a etapa do recurso que falhou', async () => {
    const log = [
      hook('apply_start', 'cloudflare_r2_bucket.media', 'delete'),
      hook('apply_errored', 'cloudflare_r2_bucket.media', 'delete'),
    ].join('\n');
    const t = tofu({
      infraApply: { exitCode: 10, log, file: infraFailed('permanent', 'bucket não está vazio') },
    });
    expect(await t.driver.apply(removal, () => Promise.resolve())).toEqual({
      status: 'failed',
      step: 'imagens',
      failure: { kind: 'permanent', message: 'bucket não está vazio' },
    });
  });

  it('resultado do tipo errado no apply é falha', async () => {
    const created = tofu({ infraApply: { file: infraApplyOk() } });
    expect(await created.driver.apply(removal, () => Promise.resolve())).toMatchObject({
      status: 'failed',
      failure: { message: 'infra-apply.json relata criação num apply de remoção' },
    });
    const destroyed = tofu({ infraApply: { file: infraDestroyed() } });
    expect(await destroyed.driver.apply(target, () => Promise.resolve())).toMatchObject({
      status: 'failed',
      failure: { message: 'infra-apply.json relata destruição num apply de criação' },
    });
  });
});

describe('localDriver', () => {
  const check = { siteId: 'exemplo-a', domain: 'exemplo-a.com.br' };
  const collect = () => {
    const steps: InfraStep[] = [];
    return { steps, onStep: (step: InfraStep) => (steps.push(step), Promise.resolve()) };
  };

  it('percorre as cinco etapas e fecha com nameservers fictícios', async () => {
    const driver = localDriver();
    const plan = await driver.plan(target);
    expect(plan.status).toBe('ok');
    if (plan.status !== 'ok') return;
    for (const changes of Object.values(plan.summary.steps))
      expect(changes.length).toBeGreaterThan(0);

    const { steps, onStep } = collect();
    expect(await driver.apply(target, onStep)).toEqual({
      status: 'ok',
      nameservers: LOCAL_NAMESERVERS,
    });
    expect(steps).toEqual(['endereco', 'dns', 'email', 'regras', 'imagens']);
  });

  it('depois da falha forçada, a nova execução só cria o que faltou', async () => {
    const driver = localDriver({ failStep: 'email' });
    const first = collect();
    expect(await driver.apply(target, first.onStep)).toEqual({
      status: 'failed',
      step: 'email',
      failure: { kind: 'permanent', message: 'Falha simulada na etapa email (driver local)' },
    });
    expect(first.steps).toEqual(['endereco', 'dns', 'email']);

    const plan = await driver.plan(target);
    if (plan.status !== 'ok') throw new Error('plano falhou');
    expect(plan.summary.steps.endereco).toEqual([]);
    expect(plan.summary.steps.dns).toEqual([]);
    expect(plan.summary.steps.email.length).toBeGreaterThan(0);

    const retry = collect();
    expect(await driver.apply(target, retry.onStep)).toMatchObject({ status: 'ok' });
    expect(retry.steps).toEqual(['email', 'regras', 'imagens']);
  });

  it('check: só os sites configurados saem desatualizados, sem usar a memória', async () => {
    const driver = localDriver({ driftSites: ['exemplo-b'] });
    const fresh = await driver.check(check);
    expect(fresh.status === 'ok' && planHasChanges(fresh.summary)).toBe(false);

    const drifted = await driver.check({ ...check, siteId: 'exemplo-b' });
    expect(drifted).toEqual({ status: 'ok', summary: summarizePlan([LOCAL_DRIFT_CHANGE]) });
  });

  it('a memória é por site', async () => {
    const driver = localDriver({ failStep: 'dns' });
    await driver.apply(target, () => Promise.resolve());
    const other = collect();
    expect(
      await driver.apply({ ...target, runId: 8, siteId: 'exemplo-b' }, other.onStep),
    ).toMatchObject({ status: 'failed', step: 'dns' });
    expect(other.steps).toEqual(['endereco', 'dns']);
  });

  it('a remoção lista o que foi criado como remoções e percorre na ordem inversa', async () => {
    const driver = localDriver();
    await driver.apply(target, () => Promise.resolve());

    const plan = await driver.plan(removal);
    if (plan.status !== 'ok') throw new Error('plano falhou');
    for (const changes of Object.values(plan.summary.steps)) {
      expect(changes.length).toBeGreaterThan(0);
      expect(changes.every((c) => c.action === 'delete')).toBe(true);
    }
    const { steps, onStep } = collect();
    expect(await driver.apply(removal, onStep)).toEqual({ status: 'ok', nameservers: [] });
    expect(steps).toEqual(['imagens', 'regras', 'email', 'dns', 'endereco']);
  });

  it('site sem memória conta como todo criado na remoção', async () => {
    const plan = await localDriver().plan(removal);
    if (plan.status !== 'ok') throw new Error('plano falhou');
    for (const changes of Object.values(plan.summary.steps))
      expect(changes.length).toBeGreaterThan(0);
  });

  it('depois da falha forçada, a nova remoção termina ok e a criação seguinte cria tudo', async () => {
    const driver = localDriver({ failStep: 'email' });
    await driver.apply(target, () => Promise.resolve()); // a criação falha uma vez
    await driver.apply(target, () => Promise.resolve());

    const first = collect();
    expect(await driver.apply(removal, first.onStep)).toMatchObject({
      status: 'failed',
      step: 'email',
    });
    expect(first.steps).toEqual(['imagens', 'regras', 'email']);

    const plan = await driver.plan(removal);
    if (plan.status !== 'ok') throw new Error('plano falhou');
    expect(plan.summary.steps.imagens).toEqual([]);
    expect(plan.summary.steps.regras).toEqual([]);
    expect(plan.summary.steps.email.length).toBeGreaterThan(0);
    const retry = collect();
    expect(await driver.apply(removal, retry.onStep)).toEqual({ status: 'ok', nameservers: [] });
    expect(retry.steps).toEqual(['email', 'dns', 'endereco']);

    const again = collect();
    expect(await driver.apply(target, again.onStep)).toEqual({
      status: 'ok',
      nameservers: LOCAL_NAMESERVERS,
    });
    expect(again.steps).toEqual(['endereco', 'dns', 'email', 'regras', 'imagens']);
  });
});
