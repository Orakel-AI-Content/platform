// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type {
  ExecutionHistoryItem,
  OpenExecution,
  SiteActivity,
  SiteHistoryItem,
} from '@/domain/builds/builds.ts';

import {
  type PublicationInstance,
  type PublicationSite,
  SitePublicationSteps,
} from './SitePublicationSteps.tsx';

// Painel de etapas da aba "Publicação" (#647): Infra e zona, Versão, Build, No ar e Site, nessa
// ordem, cada uma com o estado em texto visível e dito uma vez ao leitor de tela.

afterEach(cleanup);

const TZ = 'America/Sao_Paulo';

const SITE: PublicationSite = {
  lifecycle: 'publicado',
  release: '1.4.0',
  activeVersionId: 'v41',
  state: 'ativo',
  pausedReason: null,
  timeZone: TZ,
};

const INSTANCE: PublicationInstance = {
  activePages: 120,
  activeSince: { at: new Date('2026-10-11T17:02:00Z'), by: 'ana@orakel.local' },
};

const BUILD_OK: ExecutionHistoryItem = {
  type: 'execucao',
  id: 6,
  kind: 'build',
  status: 'ok',
  requestedBy: 'ana@orakel.local',
  cancelRequestedBy: null,
  at: new Date('2026-10-11T17:02:00Z'),
  release: '1.4.0',
  versionId: 'v41',
  failure: null,
};

const ROLLBACK: SiteHistoryItem = { ...BUILD_OK, id: 9, kind: 'rollback', status: 'failed' };

const QUEUED: OpenExecution = {
  id: 7,
  kind: 'build',
  status: 'na_fila',
  currentStage: null,
  scheduledFor: new Date('2026-10-11T18:00:00Z'),
  startedAt: null,
  requestedBy: 'ana@orakel.local',
  cancelRequestedAt: null,
};

const activity = (open: OpenExecution | null, history: SiteHistoryItem[] = []): SiteActivity => ({
  open,
  history,
});

const items = () =>
  within(screen.getByRole('list', { name: 'Etapas da publicação' })).getAllByRole('listitem');

/** O texto do item como o leitor de tela o lê: sem o que é `aria-hidden`. */
const spokenText = (item: HTMLElement) => {
  const clone = item.cloneNode(true) as HTMLElement;
  for (const hidden of clone.querySelectorAll('[aria-hidden="true"], [aria-hidden=""]')) {
    hidden.remove();
  }
  return clone.textContent;
};

const description = (index: number) =>
  items()[index]?.querySelector('.step-item-description')?.textContent;

function renderPanel(
  site: Partial<PublicationSite> = {},
  current: SiteActivity = activity(null, [BUILD_OK]),
  instance: PublicationInstance = INSTANCE,
) {
  return render(
    <SitePublicationSteps site={{ ...SITE, ...site }} instance={instance} activity={current} />,
  );
}

describe('painel de etapas', () => {
  it('lista as cinco etapas em ordem, com o estado em texto e dito uma vez', () => {
    renderPanel();

    expect(screen.getByRole('list', { name: 'Etapas da publicação' }).tagName).toBe('OL');
    expect(items().map(spokenText)).toEqual([
      'Infra e zonaInfra aplicada e zona ativa (concluída)',
      'Versão1.4.0 (concluída)',
      'BuildPublicação concluída em 11/10/2026, 14:02 BRT (concluída)',
      'No arv41 · 120 páginas · no ar desde 11/10/2026, 14:02 BRT, por ana@orakel.local (concluída)',
      'SiteAtivo (concluída)',
    ]);
    for (const item of items()) expect(item.querySelectorAll('.sr-only')).toHaveLength(1);
    // Tudo concluído: nenhuma etapa é a atual.
    expect(items().map((item) => item.getAttribute('aria-current'))).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('sem as ações de operação (sem operations.run), nenhum botão e os estados de sempre', () => {
    renderPanel({ state: 'pausado', pausedReason: 'falha permanente no render' });

    expect(screen.queryAllByRole('button')).toEqual([]);
    expect([0, 1, 2, 3, 4].map(description)).toEqual([
      'Infra aplicada e zona ativa',
      '1.4.0',
      'Publicação concluída em 11/10/2026, 14:02 BRT',
      'v41 · 120 páginas · no ar desde 11/10/2026, 14:02 BRT, por ana@orakel.local',
      'Pausado: falha permanente no render',
    ]);
  });

  it('sem operations.run, nem "Cancelar" com publicação aberta nem "Desfazer" (#649)', () => {
    renderPanel({}, activity(QUEUED, [BUILD_OK]));

    expect(screen.queryAllByRole('button')).toEqual([]);
  });

  it('com as ações, cada uma abaixo do estado da sua etapa', () => {
    render(
      <SitePublicationSteps
        site={SITE}
        instance={INSTANCE}
        activity={activity(null, [BUILD_OK])}
        actions={{
          versao: <button type="button">Versão</button>,
          build: <button type="button">Build</button>,
          no_ar: <button type="button">No ar</button>,
          site: <button type="button">Site</button>,
        }}
      />,
    );

    expect(items().map((item) => within(item).queryByRole('button')?.textContent)).toEqual([
      undefined,
      'Versão',
      'Build',
      'No ar',
      'Site',
    ]);
    expect(description(1)).toBe('1.4.0Versão');
  });

  it('na fila, a etapa Build mostra "na fila" com o horário previsto no fuso do site', () => {
    renderPanel({}, activity(QUEUED, [BUILD_OK]));

    expect(description(2)).toBe('Publicação na fila, prevista para 11/10/2026, 15:00 BRT');
    expect(items()[2]?.getAttribute('aria-current')).toBe('step');
    expect(items()[2]?.classList).toContain('step-item-in-progress');
  });

  it('rodando, a etapa Build mostra a etapa atual da execução', () => {
    renderPanel(
      {},
      activity({ ...QUEUED, status: 'rodando', currentStage: 'render', scheduledFor: null }),
    );

    expect(description(2)).toBe('Publicação em andamento, etapa: Renderização');
  });

  it('sem execução aberta, o resultado do último build, sem contar a reversão', () => {
    renderPanel({}, activity(null, [ROLLBACK, { ...BUILD_OK, status: 'failed' }]));

    expect(description(2)).toBe('Publicação falhou em 11/10/2026, 14:02 BRT');
    expect(items()[2]?.classList).toContain('step-item-error');
  });

  it('sem nenhum build, diz que ainda não houve', () => {
    renderPanel({}, activity(null));

    expect(description(2)).toBe('Nenhum build ainda');
  });

  it('site pausado mostra o motivo na linha Site', () => {
    renderPanel({ state: 'pausado', pausedReason: 'falha permanente no render' });

    expect(description(4)).toBe('Pausado: falha permanente no render');
    expect(spokenText(items()[4]!)).toBe('SitePausado: falha permanente no render (com erro)');
  });

  it('sem versão no ar, a etapa No ar diz "Nenhuma versão no ar"', () => {
    renderPanel({ activeVersionId: null, lifecycle: 'zona_ativa' }, activity(null), {
      activePages: null,
      activeSince: null,
    });

    expect(description(3)).toBe('Nenhuma versão no ar');
    // A primeira não concluída é a atual: Build, sem nenhum build.
    expect(items().map((item) => item.getAttribute('aria-current'))).toEqual([
      null,
      null,
      'step',
      null,
      null,
    ]);
  });

  it('cadastrado, Infra e zona é a atual e leva a ação que a página passa', () => {
    render(
      <SitePublicationSteps
        site={{ ...SITE, lifecycle: 'cadastrado', release: null, activeVersionId: null }}
        instance={{ activePages: null, activeSince: null }}
        activity={activity(null)}
        lifecycleAction={<button type="button">Marcar infra aplicada</button>}
      />,
    );

    expect(description(0)).toBe('Infra e zona pendentesMarcar infra aplicada');
    expect(items()[0]?.contains(screen.getByRole('button'))).toBe(true);
    expect(items()[0]?.getAttribute('aria-current')).toBe('step');
    expect(description(1)).toBe('Nenhuma release');
  });
});
