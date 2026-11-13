import { RESOURCES, type Resources } from '@orakel/content-model/v1';
import { and, asc, eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Db } from '../../src/db/client.ts';
import {
  contentVersions,
  generationRuns,
  publications,
  reviewConfirmations,
  reviewOpinions,
  reviews,
  sites,
} from '../../src/db/schema/index.ts';
import { readFixture } from '../../src/bin/seed.ts';
import { SYSTEM_ACTOR, type Actor } from '../../src/domain/access/rbac.ts';
import {
  type ContentEdit,
  type NewBlock,
  listContentVersions,
  submitForReview,
  updateContent,
} from '../../src/domain/content/contents.ts';
import { CORRECT_ARTICLE_TASK } from '../../src/domain/generation/runs.ts';
import { importSnapshot } from '../../src/domain/import/import-snapshot.ts';
import { PUBLISH_SCHEDULED_TASK } from '../../src/domain/publications/schedule.ts';
import {
  reviewConfirmations as readConfirmations,
  setAllConfirmations,
  setConfirmation,
} from '../../src/domain/reviews/confirmations.ts';
import {
  approveAndPublish,
  approveAndSchedule,
  approveVersion,
  pendingReturn,
  returnVersion,
  REVIEW_CHECKLIST,
  reviewChecks,
  reviewIssues,
  reviewChanges,
  reviewQueue,
} from '../../src/domain/reviews/reviews.ts';
import {
  externalLinks,
  linkCheckFor,
  recordLinkCheck,
} from '../../src/domain/reviews/link-checks.ts';
import type { Opinion, OpinionPoint } from '../../src/domain/reviews/opinion.ts';
import {
  enqueueOpinion,
  opinionFor,
  opinionOutlook,
  recordOpinion,
  type OpinionTarget,
} from '../../src/domain/reviews/opinions.ts';
import { reviewCheckItems } from '../../src/components/review/reviewCheckItems.ts';
import type * as Sites from '../../src/domain/sites/sites.ts';
import { unresolvedPendingChangeIds } from '../../src/domain/sites/sites.ts';
import { resetDatabase, setupDatabase } from './helpers.ts';

// Aprovação da revisão (#73): checklist, validação pela release do site e registro em reviews.
// Confirmações do checklist gravadas por versão (#749): marcar, desmarcar, ler, e a aprovação
// que exige as três gravadas.
// Devolução ao editor (#598): comentário obrigatório, volta a rascunho e a devolução pendente.
// Aprovar e publicar ou agendar numa decisão só, com transbordo para a próxima vaga (#759).
// Fila de revisão com pendências, links e devolvido de cada item (#772) e o parecer (#774).
// O que mudou desde a última revisão (#768): a base é a versão da revisão mais recente.

// Recursos da release: `resourcesFor` devolve os RESOURCES até o registro por release
// (workspace#26); aqui o teste troca o retorno para simular uma release sem o bloco faq.
const release = vi.hoisted(() => ({ override: undefined as Resources | undefined }));
vi.mock('../../src/domain/sites/sites.ts', async (importOriginal) => {
  const original = await importOriginal<typeof Sites>();
  return {
    ...original,
    resourcesFor: async (...args: Parameters<typeof original.resourcesFor>) =>
      release.override ?? (await original.resourcesFor(...args)),
  };
});

let db: Db;
let close: () => Promise<void>;

const SITE = 'exemplo-a';
const ALL = REVIEW_CHECKLIST.map((item) => item.key);
const withoutFaq: Resources = {
  ...RESOURCES,
  blockTypes: RESOURCES.blockTypes.filter((t) => t !== 'faq'),
};
const role = (name: 'editor' | 'revisor' | 'operacao' | 'admin'): Actor => ({
  email: `${name}@orakel.local`,
  roles: [name],
});

beforeAll(async () => {
  ({ db, close } = await setupDatabase());
});
afterAll(() => close());
beforeEach(async () => {
  await resetDatabase(db);
  const imported = await importSnapshot(db, SYSTEM_ACTOR, await readFixture(SITE));
  if (!imported.ok) throw new Error(JSON.stringify(imported.issues));
});
afterEach(() => {
  release.override = undefined;
});

async function versions(contentId: number) {
  return db
    .select()
    .from(contentVersions)
    .where(and(eq(contentVersions.siteId, SITE), eq(contentVersions.contentId, contentId)))
    .orderBy(asc(contentVersions.version));
}

/**
 * Nova versão em rascunho (o título ganha o número dela: sem alteração, nenhuma versão é
 * criada, #523) e, se pedido, enviada para revisão.
 */
async function draft(contentId: number, submit = true): Promise<number> {
  const last = (await versions(contentId)).at(-1);
  if (last === undefined) throw new Error(`conteúdo ${contentId} sem versão`);
  const saved = await db.transaction((tx) =>
    updateContent(tx, SYSTEM_ACTOR, SITE, contentId, {
      ...last.data,
      title: `${last.data.title} (v${String(last.version + 1)})`,
    }),
  );
  if (!saved.ok) throw new Error(JSON.stringify(saved.issues));
  if (submit) await db.transaction((tx) => submitForReview(tx, SYSTEM_ACTOR, SITE, contentId));
  return saved.value.version;
}

const mark = (
  contentId: number,
  version: number,
  key: string,
  confirmed = true,
  actor = role('revisor'),
) => db.transaction((tx) => setConfirmation(tx, actor, SITE, contentId, version, key, confirmed));

/** Grava as confirmações `keys` na versão, como o revisor; falha o teste se alguma é recusada. */
async function confirm(contentId: number, version: number, keys: readonly string[] = ALL) {
  for (const key of keys) {
    const marked = await mark(contentId, version, key);
    if (!marked.ok) throw new Error(JSON.stringify(marked.issues));
  }
}

const approve = (contentId: number, version: number, actor = role('revisor')) =>
  db.transaction((tx) => approveVersion(tx, actor, SITE, contentId, version));

async function confirmations(contentId: number, version: number) {
  return db
    .select()
    .from(reviewConfirmations)
    .where(
      and(
        eq(reviewConfirmations.siteId, SITE),
        eq(reviewConfirmations.contentId, contentId),
        eq(reviewConfirmations.version, version),
      ),
    );
}

describe('confirmações da revisão por versão (#749)', () => {
  it('marcar grava a chave, quem marcou e quando; marcar de novo não duplica nem troca o autor', async () => {
    const version = await draft(1);

    expect(await mark(1, version, 'valor_original')).toEqual({
      ok: true,
      value: { confirmed: ['valor_original'] },
    });
    expect(await mark(1, version, 'valor_original', true, role('admin'))).toMatchObject({
      ok: true,
      value: { confirmed: ['valor_original'] },
    });

    const rows = await confirmations(1, version);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      siteId: SITE,
      contentId: 1,
      version,
      key: 'valor_original',
      confirmedBy: 'revisor@orakel.local',
    });
    expect(rows[0]?.confirmedAt).toBeInstanceOf(Date);
  });

  it('desmarcar remove a confirmação; marcar e desmarcar todas de uma vez', async () => {
    const version = await draft(1);
    await confirm(1, version, ['valor_original', 'visualizacao_conferida']);

    expect(await mark(1, version, 'valor_original', false)).toEqual({
      ok: true,
      value: { confirmed: ['visualizacao_conferida'] },
    });
    expect((await confirmations(1, version)).map((row) => row.key)).toEqual([
      'visualizacao_conferida',
    ]);

    const all = await db.transaction((tx) =>
      setAllConfirmations(tx, role('revisor'), SITE, 1, version, true),
    );
    expect(all).toEqual({ ok: true, value: { confirmed: ALL } });
    expect(await confirmations(1, version)).toHaveLength(3);

    const none = await db.transaction((tx) =>
      setAllConfirmations(tx, role('revisor'), SITE, 1, version, false),
    );
    expect(none).toEqual({ ok: true, value: { confirmed: [] } });
    expect(await confirmations(1, version)).toEqual([]);
  });

  it('recusa chave fora do checklist, inclusive as que saíram', async () => {
    const version = await draft(1);

    for (const key of ['inventado', 'descricao_imagens', 'imagens_decorativas_marcadas']) {
      expect(await mark(1, version, key)).toMatchObject({
        ok: false,
        issues: [{ code: 'review.unknown_confirmation', path: ['key'] }],
      });
    }
    expect(await confirmations(1, version)).toEqual([]);
  });

  it('recusa versão que não é a mais recente, fora de em_revisao ou de conteúdo inexistente', async () => {
    const reviewed = await draft(1);
    await draft(1, false);
    const latest = (await versions(1)).at(-1)?.version ?? 0;

    for (const confirmed of [true, false]) {
      expect(await mark(1, reviewed, 'valor_original', confirmed)).toMatchObject({
        ok: false,
        issues: [{ code: 'review.not_latest' }],
      });
      expect(await mark(1, latest, 'valor_original', confirmed)).toMatchObject({
        ok: false,
        issues: [{ code: 'review.not_in_review' }],
      });
      expect(await mark(999, 1, 'valor_original', confirmed)).toMatchObject({
        ok: false,
        issues: [{ code: 'content.not_found' }],
      });
    }
    expect(await db.select().from(reviewConfirmations)).toEqual([]);
  });

  it.each(['editor', 'operacao'] as const)('%s não marca nem desmarca', async (name) => {
    const version = await draft(1);
    await confirm(1, version, ['valor_original']);

    expect(await mark(1, version, 'visualizacao_conferida', true, role(name))).toMatchObject({
      ok: false,
      issues: [{ code: 'forbidden' }],
    });
    expect(await mark(1, version, 'valor_original', false, role(name))).toMatchObject({
      ok: false,
      issues: [{ code: 'forbidden' }],
    });
    const all = await db.transaction((tx) =>
      setAllConfirmations(tx, role(name), SITE, 1, version, true),
    );
    expect(all).toMatchObject({ ok: false, issues: [{ code: 'forbidden' }] });
    expect((await confirmations(1, version)).map((row) => row.key)).toEqual(['valor_original']);
  });

  it('ler devolve só as da versão pedida, na ordem do checklist; exige site.read', async () => {
    const first = await draft(1);
    await confirm(1, first, ['visualizacao_conferida', 'valor_original']);
    const second = await draft(1);
    await confirm(1, second, ['politicas_anuncios_afiliados']);

    const read = (version: number, actor: Actor = role('editor')) =>
      readConfirmations(db, actor, SITE, 1, version);

    const old = await read(first);
    if (!old.ok) throw new Error(JSON.stringify(old.issues));
    expect(old.value.map((item) => item.key)).toEqual(['valor_original', 'visualizacao_conferida']);
    expect(old.value[0]).toMatchObject({ confirmedBy: 'revisor@orakel.local' });
    expect(old.value[0]?.confirmedAt).toBeInstanceOf(Date);
    expect(await read(second)).toMatchObject({
      ok: true,
      value: [{ key: 'politicas_anuncios_afiliados' }],
    });
    expect(await read(second, { email: 'ninguem@orakel.local', roles: [] })).toMatchObject({
      ok: false,
      issues: [{ code: 'forbidden' }],
    });
  });
});

describe('aprovar a versão em revisão', () => {
  it('grava revisor, versão, checklist e data em reviews e deixa a versão aprovado', async () => {
    const version = await draft(1);
    const before = (await versions(1)).at(-1);
    const pending = await unresolvedPendingChangeIds(db, SITE);
    // Marcadas fora da ordem: a revisão grava as chaves na ordem do checklist.
    await confirm(1, version, [...ALL].reverse());

    const result = await approve(1, version);

    expect(result).toMatchObject({ ok: true });
    const rows = await db.select().from(reviews);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      siteId: SITE,
      contentId: 1,
      version,
      reviewer: 'revisor@orakel.local',
      checklist: ALL,
    });
    expect(rows[0]?.createdAt).toBeInstanceOf(Date);
    const after = (await versions(1)).at(-1);
    expect(after?.status).toBe('aprovado');
    expect(after?.data).toEqual(before?.data);
    expect(await unresolvedPendingChangeIds(db, SITE)).toEqual(pending);
  });

  it('com a release sem um bloco usado no conteúdo, devolve a issue e recusa a aprovação', async () => {
    const version = await draft(1);
    await confirm(1, version);
    release.override = withoutFaq;

    const issues = await reviewIssues(db, role('editor'), SITE, 1);
    const result = await approve(1, version);

    expect(issues).toMatchObject({
      ok: true,
      value: { version, issues: [{ code: 'semantic.supported-resources' }] },
    });
    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: 'semantic.supported-resources' }],
    });
    expect(await db.select().from(reviews)).toEqual([]);
    expect((await versions(1)).at(-1)?.status).toBe('em_revisao');
  });

  it('recusa sem as três confirmações gravadas na versão, até a última ser marcada', async () => {
    const version = await draft(1);

    expect(await approve(1, version)).toMatchObject({
      ok: false,
      issues: [{ code: 'review.checklist_incomplete', path: ['checklist'] }],
    });
    await confirm(1, version, ALL.slice(1));
    expect(await approve(1, version)).toMatchObject({
      ok: false,
      issues: [{ code: 'review.checklist_incomplete', path: ['checklist'] }],
    });
    expect(await db.select().from(reviews)).toEqual([]);

    await confirm(1, version, ALL.slice(0, 1));
    expect(await approve(1, version)).toMatchObject({ ok: true });
  });

  it('confirmações de outra versão não valem para a versão em revisão', async () => {
    const old = await draft(1);
    await confirm(1, old);
    const version = await draft(1);

    expect(await approve(1, version)).toMatchObject({
      ok: false,
      issues: [{ code: 'review.checklist_incomplete' }],
    });
  });

  it('o checklist tem só as três confirmações humanas', () => {
    expect(ALL).toEqual([
      'valor_original',
      'politicas_anuncios_afiliados',
      'visualizacao_conferida',
    ]);
  });

  it('imagem sem descrição continua impedindo a aprovação, pela validação da release', async () => {
    const version = await draft(1);
    const current = (await versions(1)).at(-1);
    if (current === undefined) throw new Error('conteúdo 1 sem versão');
    // Gravada direto: a edição já recusa a imagem sem alt; aqui a versão em revisão a carrega.
    const image = {
      n: 9999,
      type: 'image',
      mediaId: 1,
    } as unknown as (typeof current.data.blocks)[number];
    await db
      .update(contentVersions)
      .set({ data: { ...current.data, blocks: [...current.data.blocks, image] } })
      .where(
        and(
          eq(contentVersions.siteId, SITE),
          eq(contentVersions.contentId, 1),
          eq(contentVersions.version, version),
        ),
      );

    await confirm(1, version);
    const result = await approve(1, version);

    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.issues.some((issue) => issue.code.startsWith('schema.'))).toBe(
      true,
    );
    expect(await db.select().from(reviews)).toEqual([]);
    expect((await versions(1)).at(-1)?.status).toBe('em_revisao');
  });

  it('revisão gravada com os cinco itens antigos continua legível', async () => {
    const version = await draft(1);
    const legacy = [
      'valor_original',
      'politicas_anuncios_afiliados',
      'descricao_imagens',
      'visualizacao_conferida',
      'imagens_decorativas_marcadas',
    ];
    await db.insert(reviews).values({
      siteId: SITE,
      contentId: 1,
      version,
      reviewer: 'revisor@orakel.local',
      checklist: legacy,
    });

    const [row] = await db.select().from(reviews);
    const listed = await listContentVersions(db, SYSTEM_ACTOR, SITE, 1);

    expect(row?.checklist).toEqual(legacy);
    if (!listed.ok) throw new Error(JSON.stringify(listed.issues));
    expect(listed.value.find((v) => v.version === version)?.approval).toMatchObject({
      reviewer: 'revisor@orakel.local',
    });
  });

  it('recusa versão que não é a mais recente e versão fora de em_revisao', async () => {
    const reviewed = await draft(1);
    await draft(1, false);

    expect(await approve(1, reviewed)).toMatchObject({
      ok: false,
      issues: [{ code: 'review.not_latest' }],
    });
    const latest = (await versions(1)).at(-1)?.version ?? 0;
    expect(await approve(1, latest)).toMatchObject({
      ok: false,
      issues: [{ code: 'review.not_in_review' }],
    });
    expect(await approve(999, 1)).toMatchObject({
      ok: false,
      issues: [{ code: 'content.not_found' }],
    });
    expect(await db.select().from(reviews)).toEqual([]);
    expect((await versions(1)).map((v) => v.status)).not.toContain('aprovado');
  });

  it.each(['editor', 'operacao'] as const)('%s não aprova', async (name) => {
    const version = await draft(1);
    await confirm(1, version);

    expect(await approve(1, version, role(name))).toMatchObject({
      ok: false,
      issues: [{ code: 'forbidden' }],
    });
    expect((await versions(1)).at(-1)?.status).toBe('em_revisao');
  });

  it.each(['admin', 'revisor'] as const)('%s aprova', async (name) => {
    const version = await draft(1);
    await confirm(1, version);

    expect(await approve(1, version, role(name))).toMatchObject({ ok: true });
  });
});

describe('aprovar e publicar ou agendar numa decisão só (#759)', () => {
  /** "Agora" da decisão: 08:00 de São Paulo de 2026-11-04. */
  const NOW = new Date('2026-11-04T08:00:00-03:00');
  const at = (day: string, time = '08:00') => new Date(`${day}T${time}:00-03:00`);

  const setSiteLimit = (limit: number | null) =>
    db.update(sites).set({ dailyPublishLimit: limit }).where(eq(sites.id, SITE));

  /** Ocupa `count` vagas do dia de São Paulo de `day` com publicações de outro conteúdo. */
  async function fillDay(day: string, count: number) {
    const [other] = await versions(2);
    if (other === undefined) throw new Error('conteúdo 2 sem versão');
    await db.insert(publications).values(
      Array.from({ length: count }, (_, index) => ({
        siteId: SITE,
        contentId: 2,
        version: other.version,
        publishedBy: 'revisor@orakel.local',
        publishedAt: at(day, `1${String(index)}:00`),
      })),
    );
  }

  /** Nova versão em revisão, com as três confirmações gravadas pelo revisor. */
  async function ready(contentId: number): Promise<number> {
    const version = await draft(contentId);
    await confirm(contentId, version);
    return version;
  }

  const publishNow = (contentId: number, version: number, actor = role('revisor')) =>
    db.transaction((tx) => approveAndPublish(tx, actor, SITE, contentId, version, { now: NOW }));

  const scheduleAt = (contentId: number, version: number, when: Date, actor = role('revisor')) =>
    db.transaction((tx) =>
      approveAndSchedule(tx, actor, SITE, contentId, version, when, { now: NOW }),
    );

  const publicationsOf = (contentId: number) =>
    db
      .select()
      .from(publications)
      .where(and(eq(publications.siteId, SITE), eq(publications.contentId, contentId)));

  async function scheduledJobs() {
    const { rows } = await db.execute<{ run_at: Date }>(sql`
      select j.run_at from graphile_worker._private_jobs j
      join graphile_worker._private_tasks t on t.id = j.task_id
      where t.identifier = ${PUBLISH_SCHEDULED_TASK}`);
    return rows.map((row) => new Date(row.run_at).getTime());
  }

  beforeEach(async () => {
    await setSiteLimit(2);
    await db.execute(sql`delete from graphile_worker._private_jobs`);
  });

  it('com vaga no dia, publica: versão publicado, linha em publications e mudança pendente', async () => {
    const version = await ready(1);
    const pending = await unresolvedPendingChangeIds(db, SITE);

    const result = await publishNow(1, version);

    expect(result).toMatchObject({
      ok: true,
      value: { outcome: 'published', at: NOW, overflowed: false },
    });
    expect((await versions(1)).find((v) => v.version === version)?.status).toBe('publicado');
    expect(await publicationsOf(1)).toMatchObject([
      { version, publishedAt: NOW, scheduledFor: null },
    ]);
    expect(await db.select().from(reviews)).toMatchObject([{ version, decision: 'aprovado' }]);
    const after = await unresolvedPendingChangeIds(db, SITE);
    expect(after.length).toBeGreaterThan(pending.length);
  });

  it('com o dia cheio, agenda no primeiro dia de São Paulo com vaga, no horário da decisão', async () => {
    await fillDay('2026-11-04', 2);
    await fillDay('2026-11-05', 2);
    const version = await ready(1);
    const pending = await unresolvedPendingChangeIds(db, SITE);
    const expected = at('2026-11-06');

    const result = await publishNow(1, version);

    expect(result).toMatchObject({
      ok: true,
      value: { outcome: 'scheduled', at: expected, overflowed: true },
    });
    expect((await versions(1)).find((v) => v.version === version)?.status).toBe('agendado');
    expect(await publicationsOf(1)).toMatchObject([
      { version, publishedAt: expected, scheduledFor: expected },
    ]);
    expect(await scheduledJobs()).toEqual([expected.getTime()]);
    expect(await unresolvedPendingChangeIds(db, SITE)).toEqual(pending);
  });

  it('agenda no horário escolhido; com o dia cheio, no próximo dia com vaga, no mesmo horário', async () => {
    const free = await ready(1);
    expect(await scheduleAt(1, free, at('2026-11-06', '10:30'))).toMatchObject({
      ok: true,
      value: { outcome: 'scheduled', at: at('2026-11-06', '10:30'), overflowed: false },
    });
    expect((await versions(1)).find((v) => v.version === free)?.status).toBe('agendado');

    await fillDay('2026-11-07', 2);
    const full = await ready(3);
    const result = await scheduleAt(3, full, at('2026-11-07', '10:30'));

    expect(result).toMatchObject({
      ok: true,
      value: { outcome: 'scheduled', at: at('2026-11-08', '10:30'), overflowed: true },
    });
    expect(await publicationsOf(3)).toMatchObject([
      { version: full, scheduledFor: at('2026-11-08', '10:30') },
    ]);
  });

  it('uma recusa desfaz tudo: a versão não fica aprovado e nada vai para publications', async () => {
    const reviewed = await draft(1);
    await draft(1, false);
    expect(await publishNow(1, reviewed)).toMatchObject({
      ok: false,
      issues: [{ code: 'review.not_latest' }],
    });

    const version = await draft(3);
    await confirm(3, version, ALL.slice(1));
    expect(await publishNow(3, version)).toMatchObject({
      ok: false,
      issues: [{ code: 'review.checklist_incomplete' }],
    });
    await confirm(3, version, ALL.slice(0, 1));
    expect(await scheduleAt(3, version, NOW)).toMatchObject({
      ok: false,
      issues: [{ code: 'publication.schedule_not_future' }],
    });

    await setSiteLimit(0);
    expect(await publishNow(3, version)).toMatchObject({
      ok: false,
      issues: [{ code: 'publication.no_slot' }],
    });
    expect(await scheduleAt(3, version, at('2026-11-06'))).toMatchObject({
      ok: false,
      issues: [{ code: 'publication.no_slot' }],
    });

    expect((await versions(3)).at(-1)?.status).toBe('em_revisao');
    expect((await versions(1)).map((v) => v.status)).not.toContain('aprovado');
    expect(await db.select().from(reviews)).toEqual([]);
    expect(await db.select().from(publications)).toEqual([]);
    expect(await scheduledJobs()).toEqual([]);
  });

  it('sem vaga em nenhum dia do horizonte, recusa com publication.no_slot', async () => {
    await setSiteLimit(1);
    const days = Array.from({ length: 31 }, (_, n) =>
      new Date(Date.UTC(2026, 10, 4 + n)).toISOString().slice(0, 10),
    );
    for (const day of days) await fillDay(day, 1);
    const version = await ready(1);

    expect(await publishNow(1, version)).toMatchObject({
      ok: false,
      issues: [{ code: 'publication.no_slot' }],
    });
    expect((await versions(1)).at(-1)?.status).toBe('em_revisao');
  });

  it.each(['editor', 'operacao'] as const)('%s não aprova e publica nem agenda', async (name) => {
    const version = await draft(1);

    expect(await publishNow(1, version, role(name))).toMatchObject({
      ok: false,
      issues: [{ code: 'forbidden' }],
    });
    expect(await scheduleAt(1, version, at('2026-11-06'), role(name))).toMatchObject({
      ok: false,
      issues: [{ code: 'forbidden' }],
    });
    expect((await versions(1)).at(-1)?.status).toBe('em_revisao');
  });
});

const giveBack = (
  contentId: number,
  version: number,
  comment = 'Falta a fonte da tabela de plantio.',
  actor = role('revisor'),
  options: { autoCorrect?: boolean } = {},
) => db.transaction((tx) => returnVersion(tx, actor, SITE, contentId, version, comment, options));

type CorrectionJob = { payload: { runId: number }; max_attempts: number; key: string | null };

/** Jobs `correct-article` (a view `jobs` não expõe o payload; a tabela privada sim). */
async function correctionJobs(): Promise<CorrectionJob[]> {
  const result = await db.execute(sql`
    select j.payload, j.max_attempts, j.key
    from graphile_worker._private_jobs j
    join graphile_worker._private_tasks t on t.id = j.task_id
    where t.identifier = ${CORRECT_ARTICLE_TASK}`);
  return result.rows as CorrectionJob[];
}

describe('devolver ao editor (#598)', () => {
  it('grava a devolução com o comentário em reviews e leva a versão a rascunho', async () => {
    const version = await draft(1);
    const before = (await versions(1)).at(-1);
    const pending = await unresolvedPendingChangeIds(db, SITE);

    const result = await giveBack(1, version, '  Falta a fonte da tabela de plantio.  ');

    expect(result).toMatchObject({ ok: true });
    const rows = await db.select().from(reviews);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      siteId: SITE,
      contentId: 1,
      version,
      reviewer: 'revisor@orakel.local',
      checklist: [],
      decision: 'devolvido',
      comment: 'Falta a fonte da tabela de plantio.',
    });
    const after = (await versions(1)).at(-1);
    expect(after?.status).toBe('rascunho');
    expect(after?.data).toEqual(before?.data);
    expect(await unresolvedPendingChangeIds(db, SITE)).toEqual(pending);
  });

  it.each(['', '   \n '])('recusa comentário vazio (%j)', async (comment) => {
    const version = await draft(1);

    expect(await giveBack(1, version, comment)).toMatchObject({
      ok: false,
      issues: [{ code: 'review.comment_required', path: ['comment'] }],
    });
    expect(await db.select().from(reviews)).toEqual([]);
    expect((await versions(1)).at(-1)?.status).toBe('em_revisao');
  });

  it('recusa versão que não é a mais recente, fora de em_revisao ou de conteúdo inexistente', async () => {
    const reviewed = await draft(1);
    await draft(1, false);
    const latest = (await versions(1)).at(-1)?.version ?? 0;

    expect(await giveBack(1, reviewed)).toMatchObject({
      ok: false,
      issues: [{ code: 'review.not_latest' }],
    });
    expect(await giveBack(1, latest)).toMatchObject({
      ok: false,
      issues: [{ code: 'review.not_in_review' }],
    });
    expect(await giveBack(999, 1)).toMatchObject({
      ok: false,
      issues: [{ code: 'content.not_found' }],
    });
    expect(await db.select().from(reviews)).toEqual([]);
  });

  it.each(['editor', 'operacao'] as const)('%s não devolve', async (name) => {
    const version = await draft(1);

    expect(await giveBack(1, version, 'Corrigir.', role(name))).toMatchObject({
      ok: false,
      issues: [{ code: 'forbidden' }],
    });
    expect((await versions(1)).at(-1)?.status).toBe('em_revisao');
  });

  it('devolvida e reenviada sem edição, a aprovação aparece uma vez só nas versões', async () => {
    const version = await draft(1);
    await giveBack(1, version);
    await db.transaction((tx) => submitForReview(tx, SYSTEM_ACTOR, SITE, 1));
    await confirm(1, version);
    const approved = await approve(1, version);
    if (!approved.ok) throw new Error(JSON.stringify(approved.issues));

    const listed = await listContentVersions(db, SYSTEM_ACTOR, SITE, 1);

    if (!listed.ok) throw new Error(JSON.stringify(listed.issues));
    const [approval] = await db.select().from(reviews).where(eq(reviews.decision, 'aprovado'));
    expect(listed.value.filter((v) => v.version === version)).toHaveLength(1);
    expect(listed.value.find((v) => v.version === version)?.approval).toEqual({
      reviewer: 'revisor@orakel.local',
      approvedAt: approval?.createdAt,
    });
  });

  it('com a correção pedida, grava a execução correcao pendente e o job na mesma transação (#798)', async () => {
    const version = await draft(1);

    const result = await giveBack(1, version, 'Corrija a fonte.', role('revisor'), {
      autoCorrect: true,
    });

    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const { reviewId, runId } = result.value;
    expect(runId).toBeTypeOf('number');
    expect(await db.select().from(reviews)).toMatchObject([
      { id: reviewId, version, decision: 'devolvido', comment: 'Corrija a fonte.' },
    ]);
    expect((await versions(1)).at(-1)?.status).toBe('rascunho');
    expect(await db.select().from(generationRuns)).toMatchObject([
      {
        id: runId,
        kind: 'correcao',
        siteId: SITE,
        contentId: 1,
        baseVersion: version,
        reviewId,
        status: 'pendente',
        topic: null,
        authorId: null,
        editorialContextVersion: null,
        createdBy: 'revisor@orakel.local',
        finishedAt: null,
      },
    ]);
    expect(await correctionJobs()).toEqual([
      { payload: { runId }, max_attempts: 1, key: `${CORRECT_ARTICLE_TASK}:${String(reviewId)}` },
    ]);
  });

  it('sem a opção, a devolução não grava execução nem job (#798)', async () => {
    const version = await draft(1);

    const result = await giveBack(1, version);

    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(Object.keys(result.value)).toEqual(['reviewId']);
    expect(await db.select().from(generationRuns)).toEqual([]);
    expect(await correctionJobs()).toEqual([]);
  });

  it('recusada, a devolução com a correção pedida não grava nada (#798)', async () => {
    const version = await draft(1);
    const opts = { autoCorrect: true };

    expect(await giveBack(1, version, '  ', role('revisor'), opts)).toMatchObject({ ok: false });
    expect(await giveBack(1, version, 'Corrigir.', role('editor'), opts)).toMatchObject({
      ok: false,
    });
    expect(await giveBack(1, version + 1, 'Corrigir.', role('revisor'), opts)).toMatchObject({
      ok: false,
    });

    expect(await db.select().from(reviews)).toEqual([]);
    expect(await db.select().from(generationRuns)).toEqual([]);
    expect(await correctionJobs()).toEqual([]);
    expect((await versions(1)).at(-1)?.status).toBe('em_revisao');
  });

  it('devolvida e ainda não aprovada, a versão não mostra aprovação', async () => {
    const version = await draft(1);
    await giveBack(1, version);

    const listed = await listContentVersions(db, SYSTEM_ACTOR, SITE, 1);

    if (!listed.ok) throw new Error(JSON.stringify(listed.issues));
    expect(listed.value.find((v) => v.version === version)?.approval).toBeNull();
  });
});

describe('devolução pendente', () => {
  const pendingOf = (actor: Actor = role('editor')) => pendingReturn(db, actor, SITE, 1);

  it('aparece depois da devolução e continua enquanto o editor salva a correção', async () => {
    const version = await draft(1);
    expect(await pendingOf()).toEqual({ ok: true, value: null });

    await giveBack(1, version);
    const [row] = await db.select().from(reviews);
    const expected = {
      version,
      reviewer: 'revisor@orakel.local',
      comment: 'Falta a fonte da tabela de plantio.',
      returnedAt: row?.createdAt,
    };
    expect(await pendingOf()).toEqual({ ok: true, value: expected });

    await draft(1, false);
    expect(await pendingOf()).toEqual({ ok: true, value: expected });
  });

  it('some no reenvio, mesmo que uma versão nova em rascunho venha depois', async () => {
    const version = await draft(1);
    await giveBack(1, version);
    await db.transaction((tx) => submitForReview(tx, SYSTEM_ACTOR, SITE, 1));
    expect(await pendingOf()).toEqual({ ok: true, value: null });

    await draft(1, false);
    expect(await pendingOf()).toEqual({ ok: true, value: null });
  });

  it('some com a aprovação depois da devolução; sem papel, forbidden', async () => {
    const version = await draft(1);
    await giveBack(1, version);
    await db.transaction((tx) => submitForReview(tx, SYSTEM_ACTOR, SITE, 1));
    await confirm(1, version);
    await approve(1, version);

    expect(await pendingOf()).toEqual({ ok: true, value: null });
    expect(await pendingOf({ email: 'x@orakel.local', roles: [] })).toMatchObject({
      issues: [{ code: 'forbidden' }],
    });
  });
});

describe('o que mudou desde a última revisão (#768)', () => {
  const changesOf = (actor: Actor = role('editor')) => reviewChanges(db, actor, SITE, 1);
  const resubmit = () => db.transaction((tx) => submitForReview(tx, SYSTEM_ACTOR, SITE, 1));

  it('na primeira revisão não há base', async () => {
    await draft(1);

    expect(await changesOf()).toEqual({ ok: true, value: null });
  });

  it('devolvida e corrigida, compara com a versão devolvida: campos e blocos', async () => {
    const returned = await draft(1);
    await giveBack(1, returned);
    const base = (await versions(1)).at(-1)!.data;
    const added: NewBlock = {
      new: true,
      type: 'text',
      content: [{ type: 'paragraph', children: [{ type: 'text', text: 'Novo parágrafo' }] }],
    };
    const saved = await db.transaction((tx) =>
      updateContent(tx, SYSTEM_ACTOR, SITE, 1, {
        ...base,
        title: 'Título corrigido',
        blocks: [...base.blocks, added],
      }),
    );
    if (!saved.ok) throw new Error(JSON.stringify(saved.issues));
    await resubmit();
    const current = (await versions(1)).at(-1)!.data;
    const block = current.blocks.at(-1)!;

    const result = await changesOf();

    expect(block).toMatchObject({ type: 'text' });
    expect(base.blocks.some((item) => item.n === block.n)).toBe(false);
    expect(result).toEqual({
      ok: true,
      value: {
        baseVersion: returned,
        version: saved.value.version,
        base,
        fields: [{ field: 'title', before: base.title, after: 'Título corrigido' }],
        blocks: [{ n: block.n, kind: 'adicionado', after: block }],
      },
    });
  });

  it('a base é a revisão mais recente, de qualquer decisão', async () => {
    const returned = await draft(1);
    await giveBack(1, returned);
    await resubmit();
    await confirm(1, returned);
    const approved = await approve(1, returned);
    if (!approved.ok) throw new Error(JSON.stringify(approved.issues));
    const latest = await draft(1);

    const result = await changesOf();

    expect(result).toMatchObject({ ok: true, value: { baseVersion: returned, version: latest } });
    expect(await db.select().from(reviews)).toHaveLength(2);
  });

  it('a revisão mais recente da própria versão atual não é base; sem papel, forbidden', async () => {
    const returned = await draft(1);
    await giveBack(1, returned);
    await resubmit();

    expect(await changesOf()).toEqual({ ok: true, value: null });
    expect(await changesOf({ email: 'x@orakel.local', roles: [] })).toMatchObject({
      issues: [{ code: 'forbidden' }],
    });
  });
});

describe('validação para a tela de revisão', () => {
  it('versão válida não tem issues; sem papel, forbidden', async () => {
    const version = await draft(1);

    expect(await reviewIssues(db, role('revisor'), SITE, 1)).toEqual({
      ok: true,
      value: { version, issues: [] },
    });
    expect(await reviewIssues(db, { email: 'x@orakel.local', roles: [] }, SITE, 1)).toMatchObject({
      issues: [{ code: 'forbidden' }],
    });
    expect(await reviewIssues(db, role('revisor'), SITE, 999)).toMatchObject({
      issues: [{ code: 'content.not_found' }],
    });
  });
});

describe('checagens de conteúdo para a tela de revisão', () => {
  const link = (href: string): NewBlock => ({
    new: true,
    type: 'text',
    content: [
      {
        type: 'paragraph',
        children: [{ type: 'link', href, children: [{ type: 'text', text: href }] }],
      },
    ],
  });

  /** Nova versão do conteúdo 1 com `changes`, enviada para revisão. */
  async function submit(changes: Partial<ContentEdit>): Promise<number> {
    const last = (await versions(1)).at(-1);
    if (last === undefined) throw new Error('conteúdo 1 sem versão');
    const saved = await db.transaction((tx) =>
      updateContent(tx, SYSTEM_ACTOR, SITE, 1, { ...last.data, ...changes }),
    );
    if (!saved.ok) throw new Error(JSON.stringify(saved.issues));
    await db.transaction((tx) => submitForReview(tx, SYSTEM_ACTOR, SITE, 1));
    return saved.value.version;
  }

  const checksOf = async (actor = role('revisor')) => {
    const result = await reviewChecks(db, actor, SITE, 1);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    return result.value;
  };
  const byKey = async (key: string) => (await checksOf()).checks.find((item) => item.key === key);

  beforeEach(async () => {
    const imported = await importSnapshot(db, SYSTEM_ACTOR, await readFixture('exemplo-b'));
    if (!imported.ok) throw new Error(JSON.stringify(imported.issues));
  });

  it('link para conteúdo no ar, categoria, autor, institucional e redirect não avisa; caminho inexistente avisa no bloco', async () => {
    const version = await submit({
      blocks: [
        link('/rotina-da-manha/'),
        link('/quem-somos'),
        link('/categoria/guias/'),
        link('/autor/ana-souza/'),
        link('/sobre/'),
        link('/guia-antigo/'),
        link('/nao-existe/'),
        link('/arroz-de-forno/'),
      ],
    });

    const result = await checksOf();

    expect(result.version).toBe(version);
    expect(result.checks.find((item) => item.key === 'links_internos')).toMatchObject({
      level: 'aviso',
      findings: [{ path: ['blocks', 6] }, { path: ['blocks', 7] }],
    });
  });

  it('título igual ao de outro conteúdo do site avisa; igual ao de outro site não', async () => {
    await submit({ title: 'Uma rotina da manhã possível' });
    expect(await byKey('titulo_duplicado')).toMatchObject({
      level: 'aviso',
      findings: [{ path: ['title'] }],
    });

    await submit({ title: 'Arroz de forno sem complicação' });
    expect(await byKey('titulo_duplicado')).toMatchObject({ level: 'ok', findings: [] });
  });

  it('só a validação da release é erro, e a aprovação continua barrando só ela', async () => {
    const version = await submit({ description: undefined, taxonomyIds: [2] });
    await confirm(1, version);
    release.override = withoutFaq;

    const { checks } = await checksOf();

    expect(checks.find((item) => item.key === 'descricao')?.level).toBe('aviso');
    expect(checks.find((item) => item.key === 'categoria')?.level).toBe('aviso');
    expect(checks.filter((item) => item.level === 'erro').map((item) => item.key)).toEqual([
      'validacao_release',
    ]);
    expect(await approve(1, version)).toMatchObject({ ok: false });
    release.override = undefined;
    expect(await approve(1, version)).toMatchObject({ ok: true });
  });

  it('sem papel, forbidden; conteúdo inexistente, not_found', async () => {
    expect(await reviewChecks(db, { email: 'x@orakel.local', roles: [] }, SITE, 1)).toMatchObject({
      ok: false,
      issues: [{ code: 'forbidden' }],
    });
    expect(await reviewChecks(db, role('revisor'), SITE, 999)).toMatchObject({
      ok: false,
      issues: [{ code: 'content.not_found' }],
    });
  });
});

describe('fila de revisão com pendências e devolvidos (#772)', () => {
  const queueOf = async (actor = role('revisor')) => {
    const result = await reviewQueue(db, actor, SITE);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    return result.value;
  };
  const entryOf = async (contentId: number) =>
    (await queueOf()).find((item) => item.id === contentId);
  const resubmit = (contentId: number) =>
    db.transaction((tx) => submitForReview(tx, SYSTEM_ACTOR, SITE, contentId));
  const textLink = (href: string): NewBlock => ({
    new: true,
    type: 'text',
    content: [
      {
        type: 'paragraph',
        children: [{ type: 'link', href, children: [{ type: 'text', text: href }] }],
      },
    ],
  });

  it('pendências de cada item são os itens não ok da tela de revisão, com os links externos', async () => {
    const last = (await versions(1)).at(-1);
    if (last === undefined) throw new Error('conteúdo 1 sem versão');
    const saved = await db.transaction((tx) =>
      updateContent(tx, SYSTEM_ACTOR, SITE, 1, {
        ...last.data,
        description: undefined,
        blocks: [
          ...last.data.blocks,
          textLink('/nao-existe/'),
          textLink('https://fora-do-ar.example/'),
        ],
      }),
    );
    if (!saved.ok) throw new Error(JSON.stringify(saved.issues));
    await resubmit(1);
    const target = { siteId: SITE, contentId: 1, version: saved.value.version };
    const blocks = (await versions(1)).at(-1)?.data.blocks ?? [];
    await db.transaction((tx) =>
      recordLinkCheck(
        tx,
        target,
        externalLinks(blocks).map((link) => ({ ...link, ok: false, reason: 'HTTP 503' })),
        new Date(),
      ),
    );
    await draft(2);

    const queue = await queueOf();

    expect(queue.map((item) => item.id).sort()).toEqual([1, 2]);
    for (const item of queue) {
      const checks = await reviewChecks(db, role('revisor'), SITE, item.id);
      const links = await linkCheckFor(db, role('revisor'), {
        siteId: SITE,
        contentId: item.id,
        version: item.version,
      });
      if (!checks.ok || !links.ok) throw new Error('leitura recusada');
      const shown = reviewCheckItems(
        checks.value.checks,
        links.value,
        (await versions(item.id)).at(-1)?.data.blocks ?? [],
      ).filter((check) => check.state === 'aviso' || check.state === 'erro');
      expect(item.pending).toBe(shown.length);
      expect(item.links).toEqual(links.value);
      if (item.id === 1) {
        expect(shown.map((check) => check.key)).toEqual(
          expect.arrayContaining(['descricao', 'links_internos', 'links_externos']),
        );
      }
    }
    const first = queue.find((item) => item.id === 1);
    expect(first?.links.state).toBe('verificado');
  });

  it('devolvido e reenviado, com ou sem edição, aparece como devolvido; enviado pela primeira vez, não', async () => {
    const same = await draft(1);
    await giveBack(1, same);
    await resubmit(1);
    const edited = await draft(2);
    await giveBack(2, edited);
    await draft(2);
    await draft(3);

    const queue = await queueOf();

    expect(queue.map(({ id, returned }) => ({ id, returned }))).toEqual(
      expect.arrayContaining([
        { id: 1, returned: true },
        { id: 2, returned: true },
        { id: 3, returned: false },
      ]),
    );
    expect(queue).toHaveLength(3);
  });

  it('aprovado antes e reenviado não aparece como devolvido, mesmo com uma devolução anterior', async () => {
    const version = await draft(1);
    await giveBack(1, version);
    await resubmit(1);
    await confirm(1, version);
    const approved = await approve(1, version);
    if (!approved.ok) throw new Error(JSON.stringify(approved.issues));
    await draft(1);

    expect(await entryOf(1)).toMatchObject({ returned: false });
  });

  it('o parecer de cada item é o da tela de revisão, nos cinco resultados, sem mudar as pendências (#774)', async () => {
    const point = (verdict: 'atende' | 'nao_atende'): OpinionPoint => ({
      verdict,
      justification: 'Justificativa.',
      excerpts: ['Trecho.'],
    });
    const opinion = (verdict: 'atende' | 'nao_atende'): Opinion => ({
      valor_original: point('atende'),
      politicas_anuncios_afiliados: point(verdict),
      linha_editorial: { verdict: 'nao_avaliado' },
    });
    const targets = new Map<number, OpinionTarget>();
    for (const contentId of [1, 2, 3]) {
      targets.set(contentId, { siteId: SITE, contentId, version: await draft(contentId) });
    }
    const pendingBefore = new Map((await queueOf()).map((item) => [item.id, item.pending]));
    /** Desfecho do job do parecer, gravado como o job grava. */
    const finish = async (contentId: number, outcome: { opinion: Opinion } | { issues: [] }) => {
      const recorded = await recordOpinion(
        db,
        targets.get(contentId)!,
        {
          result: {
            prompt: { system: 's', user: 'u' },
            provider: 'anthropic',
            model: 'teste',
            usage: { inputTokens: 1, outputTokens: 1 },
            costUsd: null,
            durationMs: 1,
            ...('opinion' in outcome ? { ok: true, ...outcome } : { ok: false, ...outcome }),
          },
          editorialContextVersion: null,
        },
        new Date(),
      );
      expect(recorded).toBe(true);
    };
    /** Resultado de cada item da fila, conferido contra o `opinionFor` da tela de revisão. */
    const outlooks = async () => {
      const queue = await queueOf();
      for (const item of queue) {
        const shown = await opinionFor(db, role('revisor'), targets.get(item.id)!);
        if (!shown.ok) throw new Error('leitura recusada');
        expect(item.opinion).toBe(opinionOutlook(shown.value));
        expect(item.pending).toBe(pendingBefore.get(item.id));
      }
      return Object.fromEntries(queue.map((item) => [item.id, item.opinion]));
    };

    // 3 continua pendente: o job não rodou.
    await finish(1, { opinion: opinion('atende') });
    await finish(2, { opinion: opinion('nao_atende') });
    expect(await outlooks()).toEqual({ 1: 'favoravel', 2: 'com_ressalvas', 3: 'pendente' });

    // 1 refeito e falho; 2 sem parecer, como uma versão enviada antes de ele existir.
    await db.transaction((tx) => enqueueOpinion(tx, targets.get(1)!));
    await finish(1, { issues: [] });
    await db
      .delete(reviewOpinions)
      .where(
        and(
          eq(reviewOpinions.siteId, SITE),
          eq(reviewOpinions.contentId, 2),
          eq(reviewOpinions.version, targets.get(2)!.version),
        ),
      );
    expect(await outlooks()).toEqual({ 1: 'falha', 2: 'ausente', 3: 'pendente' });
  });

  it('sem conteúdo em revisão, fila vazia; sem papel, forbidden', async () => {
    expect(await queueOf()).toEqual([]);
    expect(await reviewQueue(db, { email: 'x@orakel.local', roles: [] }, SITE)).toMatchObject({
      ok: false,
      issues: [{ code: 'forbidden' }],
    });
  });
});
