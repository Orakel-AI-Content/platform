// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import Modal from 'react-modal';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { APP_ELEMENT_ID } from '@/components/ui/utils/modalApp';
import type { ExecutionHistoryItem, SiteHistoryItem } from '@/domain/builds/builds.ts';

import { SiteBuildsTable } from './SiteBuildsTable.tsx';

// Histórico da aba "Publicação" em linha do tempo (#651; era a tabela do #637): publicação,
// reversão, cancelamento, troca de versão, pausa e retomada como itens, na ordem recebida, cada
// um com título, status (nas execuções), quem, quando (no fuso do site) e versão; o item de uma
// falha abre o painel de detalhe; sem itens, o estado vazio. Teclado e foco no navegador, em
// `SiteBuildsTable.browser.test.tsx`.

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

/** Texto de cada item da linha do tempo: o conteúdo, sem o botão de detalhe. */
function items() {
  return within(screen.getByRole('list'))
    .getAllByRole('listitem')
    .map((item) => {
      const [title, meta] = item.querySelectorAll('.timeline-item-content span.heading-text, p');
      const tag = item.querySelector('.tag');
      return [title?.textContent, tag?.textContent ?? null, meta?.textContent];
    });
}

describe('SiteBuildsTable', () => {
  it('um item por acontecimento, na ordem recebida, com título, status, quem, quando e versão', () => {
    render(<SiteBuildsTable history={HISTORY} timeZone="America/Sao_Paulo" />, { container: app });

    expect(items()).toEqual([
      ['Publicação cancelada', 'Cancelado', 'ana@orakel.local · 11/10/2026, 14:02 BRT'],
      [
        'Reversão',
        'Publicado',
        'joao@orakel.local · 11/10/2026, 13:40 BRT · Versão 20261010T120000Z-bbbbbbbb',
      ],
      ['Troca de versão', null, 'ana@orakel.local · 11/10/2026, 13:20 BRT · Versão 1.2.0 → 1.3.0'],
      ['Pausa: falha permanente', null, 'system · 11/10/2026, 13:10 BRT'],
      ['Publicação · falhou na etapa Publicação', 'Falhou', 'system · 11/10/2026, 13:09 BRT'],
      ['Retomada', null, 'ana@orakel.local · 11/10/2026, 12:00 BRT'],
    ]);
  });

  it('o cancelamento mostra quem cancelou, não quem pediu', () => {
    render(<SiteBuildsTable history={HISTORY} timeZone="America/Sao_Paulo" />, { container: app });

    const [cancelled] = screen.getAllByRole('listitem');
    expect(cancelled?.textContent).toContain('ana@orakel.local');
    expect(cancelled?.textContent).not.toContain('system');
  });

  it('só a falha tem "Ver detalhe", que abre o painel com etapa, mensagem e log', async () => {
    render(<SiteBuildsTable history={HISTORY} timeZone="America/Sao_Paulo" />, { container: app });

    const buttons = screen.getAllByRole('button', { name: /^Ver detalhe/ });
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Ver detalhe da falha de 11/10/2026, 13:09 BRT',
    ]);
    await userEvent.click(buttons[0] as HTMLElement);

    const dialog = screen.getByRole('dialog', { name: 'Falha da publicação' });
    expect(dialog.textContent).toContain('Publicação');
    expect(dialog.textContent).toContain('wrangler saiu com código 1');
    expect(within(dialog).getByLabelText('Fim do log').textContent).toBe('deploy falhou');
  });

  it('sem itens, o estado vazio no lugar da linha do tempo', () => {
    render(<SiteBuildsTable history={[]} timeZone="America/Sao_Paulo" />, { container: app });

    expect(screen.getByText('Nenhuma atividade ainda.')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('não usa mais a tabela', () => {
    render(<SiteBuildsTable history={HISTORY} timeZone="America/Sao_Paulo" />, { container: app });

    expect(screen.queryByRole('table')).toBeNull();
  });
});
