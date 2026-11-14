import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { renderInApp } from '../../../test/browser/render.tsx';
import type { SiteHistoryItem } from '@/domain/builds/builds.ts';

import { SiteBuildsTable } from './SiteBuildsTable.tsx';

// Histórico em linha do tempo, em Chromium (#651; era a tabela do #637): o item de uma falha
// abre o painel pelo teclado (Tab até "Ver detalhe" e Enter) e pelo clique no botão; Esc ou
// "Fechar" fecham e o foco volta ao botão do item. A paginação do histórico (#873) troca de
// página pelo teclado.
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

  it('o clique no "Ver detalhe" abre o painel e, ao fechar, o foco volta ao botão do item', async () => {
    const screen = await renderInApp(
      <SiteBuildsTable history={HISTORY} timeZone="America/Sao_Paulo" />,
    );
    const button = screen.getByRole('button', { name: DETAIL });

    await button.click();
    const dialog = page.getByRole('dialog', { name: 'Falha da publicação' });
    await expect
      .element(dialog.getByRole('heading', { name: 'Falha da publicação' }))
      .toBeVisible();

    await dialog.getByRole('button', { name: /fechar/i }).click();
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(button).toHaveFocus();
  });
});

describe('SiteBuildsTable paginado no navegador (#873)', () => {
  const many: SiteHistoryItem[] = Array.from({ length: 12 }, (_, index) => ({
    type: 'execucao',
    id: index + 1,
    kind: 'build',
    status: 'ok',
    requestedBy: 'system',
    cancelRequestedBy: null,
    at: new Date(Date.UTC(2026, 9, 11, 16, 59 - index)),
    release: '1.3.0',
    versionId: `v-${index}`,
    failure: null,
  }));

  it('Enter em "Próxima página" mostra os itens seguintes e marca a página atual', async () => {
    const screen = await renderInApp(<SiteBuildsTable history={many} timeZone="UTC" />);
    const pagination = screen.getByRole('navigation', { name: 'Paginação' });
    const next = pagination.getByRole('button', { name: 'Próxima página' });

    await expect.element(screen.getByText('v-0', { exact: false })).toBeVisible();
    (next.element() as HTMLElement).focus();
    await expect.element(next).toHaveFocus();
    await userEvent.keyboard('{Enter}');

    await expect.element(screen.getByText('v-11', { exact: false })).toBeVisible();
    await expect
      .element(pagination.getByRole('button', { name: 'Página 2' }))
      .toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('v-0', { exact: false }).query()).toBeNull();
  });
});
