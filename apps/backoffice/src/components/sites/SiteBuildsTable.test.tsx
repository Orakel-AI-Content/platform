// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import Modal from 'react-modal';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { APP_ELEMENT_ID } from '@/components/ui/utils/modalApp';
import type { ExecutionHistoryItem, SiteHistoryItem } from '@/domain/builds/builds.ts';

import { SiteBuildsTable } from './SiteBuildsTable.tsx';

// Aba "Histórico" da página do site (#637): publicação, reversão, troca de versão, pausa e
// retomada na ordem recebida, com Tipo, Status, Quem, Quando (no fuso do site) e Versão; a
// linha de uma falha abre o painel de detalhe; sem itens, o estado vazio. Teclado e foco no
// navegador, em `SiteBuildsTable.browser.test.tsx`.

const execution = (
  over: Partial<ExecutionHistoryItem> & Pick<ExecutionHistoryItem, 'id' | 'at'>,
): ExecutionHistoryItem => ({
  type: 'execucao',
  kind: 'build',
  status: 'ok',
  requestedBy: 'system',
  cancelRequestedBy: null,
  release: '1.3.0',
  versionId: null,
  failure: null,
  ...over,
});

const HISTORY: SiteHistoryItem[] = [
  execution({
    id: 5,
    at: new Date('2026-10-11T17:02:00Z'),
    status: 'cancelado',
    requestedBy: 'system',
    cancelRequestedBy: 'ana@orakel.local',
  }),
  execution({
    id: 4,
    at: new Date('2026-10-11T16:40:00Z'),
    kind: 'rollback',
    requestedBy: 'joao@orakel.local',
    versionId: '20261010T120000Z-bbbbbbbb',
  }),
  {
    type: 'evento',
    id: 3,
    kind: 'troca_de_versao',
    requestedBy: 'ana@orakel.local',
    at: new Date('2026-10-11T16:20:00Z'),
    reason: null,
    previousRelease: '1.2.0',
    release: '1.3.0',
  },
  {
    type: 'evento',
    id: 2,
    kind: 'pausa',
    requestedBy: 'system',
    at: new Date('2026-10-11T16:10:00Z'),
    reason: 'falha permanente',
    previousRelease: null,
    release: null,
  },
  execution({
    id: 3,
    at: new Date('2026-10-11T16:09:00Z'),
    status: 'failed',
    failure: {
      stage: 'publish',
      kind: 'permanent',
      message: 'wrangler saiu com código 1',
      logTail: 'deploy falhou',
    },
  }),
  {
    type: 'evento',
    id: 1,
    kind: 'retomada',
    requestedBy: 'ana@orakel.local',
    at: new Date('2026-10-11T15:00:00Z'),
    reason: null,
    previousRelease: null,
    release: null,
  },
];

let app: HTMLElement;

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  app = document.createElement('div');
  app.id = APP_ELEMENT_ID;
  document.body.append(app);
  Modal.setAppElement(app);
});
afterEach(async () => {
  cleanup();
  await waitFor(() => expect(document.querySelector('.drawer-portal')).toBeNull());
  app.remove();
});

function rows() {
  const table = screen.getByRole('table', { name: 'Histórico do site' });
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole('cell')
        .slice(0, 5)
        .map((cell) => cell.textContent),
    );
}

describe('SiteBuildsTable', () => {
  it('uma linha por item, na ordem recebida, com tipo, status, quem, quando e versão', () => {
    render(<SiteBuildsTable history={HISTORY} timeZone="America/Sao_Paulo" />, { container: app });

    const table = screen.getByRole('table', { name: 'Histórico do site' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Tipo', 'Status', 'Quem', 'Quando', 'Versão', 'Detalhe']);
    expect(rows()).toEqual([
      ['Publicação', 'Cancelado', 'ana@orakel.local', '11/10/2026, 14:02 BRT', '—'],
      [
        'Reversão',
        'Publicado',
        'joao@orakel.local',
        '11/10/2026, 13:40 BRT',
        '20261010T120000Z-bbbbbbbb',
      ],
      ['Troca de versão', '—', 'ana@orakel.local', '11/10/2026, 13:20 BRT', '1.2.0 → 1.3.0'],
      ['Pausa', '—', 'system', '11/10/2026, 13:10 BRT', '—'],
      ['Publicação', 'Falhou', 'system', '11/10/2026, 13:09 BRT', '—'],
      ['Retomada', '—', 'ana@orakel.local', '11/10/2026, 12:00 BRT', '—'],
    ]);
  });

  it('a reversão mostra quem pediu, quando e o resultado', () => {
    render(<SiteBuildsTable history={HISTORY} timeZone="America/Sao_Paulo" />, { container: app });

    const rollback = rows().find(([kind]) => kind === 'Reversão');
    expect(rollback?.slice(0, 4)).toEqual([
      'Reversão',
      'Publicado',
      'joao@orakel.local',
      '11/10/2026, 13:40 BRT',
    ]);
  });

  it('só a falha tem "Ver detalhe", que abre o painel com etapa, mensagem e log', async () => {
    render(<SiteBuildsTable history={HISTORY} timeZone="America/Sao_Paulo" />, { container: app });

    const buttons = screen.getAllByRole('button', { name: /^Ver detalhe da falha/ });
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Ver detalhe da falha de 11/10/2026, 13:09 BRT',
    ]);
    await userEvent.click(buttons[0] as HTMLElement);

    const dialog = screen.getByRole('dialog', { name: 'Falha da publicação' });
    expect(dialog.textContent).toContain('Publicação');
    expect(dialog.textContent).toContain('wrangler saiu com código 1');
    expect(within(dialog).getByLabelText('Fim do log').textContent).toBe('deploy falhou');
  });

  it('o clique na linha da falha também abre o painel', async () => {
    render(<SiteBuildsTable history={HISTORY} timeZone="America/Sao_Paulo" />, { container: app });

    await userEvent.click(screen.getByText('Falhou'));
    expect(screen.getByRole('dialog', { name: 'Falha da publicação' })).toBeTruthy();
  });

  it('sem itens, o estado vazio no lugar da tabela', () => {
    render(<SiteBuildsTable history={[]} timeZone="America/Sao_Paulo" />, { container: app });

    expect(screen.getByText('Nenhuma atividade ainda.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
