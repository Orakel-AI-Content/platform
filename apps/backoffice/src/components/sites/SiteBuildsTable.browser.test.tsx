import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { renderInApp } from '../../../test/browser/render.tsx';
import type { SiteHistoryItem } from '@/domain/builds/builds.ts';

import { SiteBuildsTable } from './SiteBuildsTable.tsx';

// Aba "Histórico" em Chromium (#637): a linha de uma falha abre o painel pelo teclado (Tab até
// "Ver detalhe" e Enter) e pelo clique na linha; Esc fecha e o foco volta ao botão da linha.
// Sem axe nem tema: componente de domínio (ADR 0020 da raiz).

const HISTORY: SiteHistoryItem[] = [
  {
    type: 'evento',
    id: 1,
    kind: 'pausa',
    requestedBy: 'system',
    at: new Date('2026-10-11T16:10:00Z'),
    reason: 'falha permanente',
    previousRelease: null,
    release: null,
  },
  {
    type: 'execucao',
    id: 3,
    kind: 'build',
    status: 'failed',
    requestedBy: 'system',
    cancelRequestedBy: null,
    at: new Date('2026-10-11T16:09:00Z'),
    release: '1.3.0',
    versionId: null,
    failure: {
      stage: 'publish',
      kind: 'permanent',
      message: 'wrangler saiu com código 1',
      logTail: 'deploy falhou',
    },
  },
];
const DETAIL = 'Ver detalhe da falha de 11/10/2026, 13:09 BRT';

describe('SiteBuildsTable no navegador', () => {
  it('Tab e Enter no "Ver detalhe" abrem o painel; Esc fecha e o foco volta ao botão', async () => {
    const screen = await renderInApp(
      <SiteBuildsTable history={HISTORY} timeZone="America/Sao_Paulo" />,
    );
    const button = screen.getByRole('button', { name: DETAIL });

    await userEvent.keyboard('{Tab}');
    await expect.element(button).toHaveFocus();
    await userEvent.keyboard('{Enter}');

    const dialog = page.getByRole('dialog', { name: 'Falha da publicação' });
    await expect
      .element(dialog.getByRole('heading', { name: 'Falha da publicação' }))
      .toBeVisible();
    await expect.element(dialog.getByText('Publicação', { exact: true })).toBeVisible();
    await expect.element(dialog.getByText('wrangler saiu com código 1')).toBeVisible();
    await expect.element(dialog.getByLabelText('Fim do log')).toHaveTextContent('deploy falhou');

    await userEvent.keyboard('{Escape}');
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(button).toHaveFocus();
  });

  it('o clique na linha abre o painel e, ao fechar, o foco vai ao botão da linha', async () => {
    const screen = await renderInApp(
      <SiteBuildsTable history={HISTORY} timeZone="America/Sao_Paulo" />,
    );

    await screen.getByRole('cell', { name: 'Falhou' }).click();
    const dialog = page.getByRole('dialog', { name: 'Falha da publicação' });
    await expect
      .element(dialog.getByRole('heading', { name: 'Falha da publicação' }))
      .toBeVisible();

    await dialog.getByRole('button', { name: /fechar/i }).click();
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(screen.getByRole('button', { name: DETAIL })).toHaveFocus();
  });
});
