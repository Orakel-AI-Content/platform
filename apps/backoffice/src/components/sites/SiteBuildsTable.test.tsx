// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import Modal from 'react-modal';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { APP_ELEMENT_ID } from '@/components/ui/utils/modalApp';
import type { ExecutionHistoryItem, SiteHistoryItem } from '@/domain/builds/builds.ts';
import type { InfraHistoryItem } from '@/domain/infra/runs.ts';

import { HISTORY_PAGE_SIZE, SiteBuildsTable } from './SiteBuildsTable.tsx';

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

  it('a criação da infra diz quem pediu, quando e o resultado: nameservers ou o motivo da falha', () => {
    const creation = (over: Partial<InfraHistoryItem>): InfraHistoryItem => ({
      type: 'infra',
      id: 2,
      kind: 'criar',
      status: 'ok',
      requestedBy: 'operacao@orakel.local',
      requestedAt: new Date('2026-10-11T16:58:00Z'),
      confirmedBy: 'operacao@orakel.local',
      at: new Date('2026-10-11T17:05:00Z'),
      nameservers: ['ada.ns.example', 'bob.ns.example'],
      failure: null,
      ...over,
    });
    render(
      <SiteBuildsTable
        history={[
          creation({}),
          creation({
            id: 1,
            status: 'falhou',
            at: new Date('2026-10-11T16:50:00Z'),
            nameservers: null,
            failure: { step: 'regras', message: 'Falha simulada' },
          }),
        ]}
        timeZone="America/Sao_Paulo"
      />,
      { container: app },
    );

    const [ok, failed] = screen.getAllByRole('listitem');
    expect(ok?.textContent).toContain('Criação da infraestrutura');
    expect(ok?.textContent).toContain('operacao@orakel.local · 11/10/2026, 14:05 BRT');
    expect(ok?.textContent).toContain('Nameservers: ada.ns.example, bob.ns.example');
    expect(failed?.textContent).toContain('Criação da infraestrutura · falhou na etapa Regras');
    expect(failed?.textContent).toContain('operacao@orakel.local · 11/10/2026, 13:50 BRT');
    expect(failed?.textContent).toContain('Motivo: Falha simulada');
  });

  it('a remoção da infra (workspace#97) sai distinta da criação, com quem pediu, quando e o resultado', () => {
    const run = (over: Partial<InfraHistoryItem>): InfraHistoryItem => ({
      type: 'infra',
      id: 3,
      kind: 'remover',
      status: 'ok',
      requestedBy: 'admin@orakel.local',
      requestedAt: new Date('2026-10-12T16:58:00Z'),
      confirmedBy: 'admin@orakel.local',
      at: new Date('2026-10-12T17:05:00Z'),
      nameservers: null,
      failure: null,
      ...over,
    });
    render(
      <SiteBuildsTable
        history={[
          run({}),
          run({
            id: 2,
            status: 'falhou',
            at: new Date('2026-10-12T16:50:00Z'),
            failure: { step: 'paginas', message: 'Worker não removido' },
          }),
          run({
            id: 1,
            kind: 'criar',
            requestedBy: 'operacao@orakel.local',
            at: new Date('2026-10-11T17:05:00Z'),
            nameservers: ['ada.ns.example'],
          }),
        ]}
        timeZone="America/Sao_Paulo"
      />,
      { container: app },
    );

    const [removed, failed, created] = screen.getAllByRole('listitem');
    expect(removed?.textContent).toContain('Remoção da infraestrutura');
    expect(removed?.textContent).toContain('admin@orakel.local · 12/10/2026, 14:05 BRT');
    expect(removed?.textContent).not.toContain('Nameservers');
    expect(failed?.textContent).toContain(
      'Remoção da infraestrutura · falhou na etapa Páginas do site',
    );
    expect(failed?.textContent).toContain('Motivo: Worker não removido');
    expect(created?.textContent).toContain('Criação da infraestrutura');
    expect(created?.textContent).toContain('operacao@orakel.local');
  });

  it('a reaplicação da infra diz quem pediu, quando e o resultado (workspace#98)', () => {
    const reapply = (over: Partial<InfraHistoryItem>): InfraHistoryItem => ({
      type: 'infra',
      id: 8,
      kind: 'reaplicar',
      status: 'ok',
      requestedBy: 'adm@orakel.local',
      requestedAt: new Date('2026-10-11T16:58:00Z'),
      confirmedBy: 'adm@orakel.local',
      at: new Date('2026-10-11T17:05:00Z'),
      nameservers: null,
      failure: null,
      ...over,
    });
    render(
      <SiteBuildsTable
        history={[
          reapply({}),
          reapply({
            id: 7,
            status: 'falhou',
            requestedBy: 'operacao@orakel.local',
            at: new Date('2026-10-11T16:50:00Z'),
            failure: { step: 'dns', message: 'token expirado' },
          }),
        ]}
        timeZone="America/Sao_Paulo"
      />,
      { container: app },
    );

    const [ok, failed] = screen.getAllByRole('listitem');
    expect(ok?.textContent).toContain('Reaplicação da infraestrutura');
    expect(ok?.textContent).toContain('adm@orakel.local · 11/10/2026, 14:05 BRT');
    expect(ok?.textContent).toContain('Infraestrutura em dia com a descrição atual');
    expect(failed?.textContent).toContain(
      'Reaplicação da infraestrutura · falhou na etapa Registros de DNS',
    );
    expect(failed?.textContent).toContain('operacao@orakel.local · 11/10/2026, 13:50 BRT');
    expect(failed?.textContent).toContain('Motivo: token expirado');
  });

  it('não usa mais a tabela', () => {
    render(<SiteBuildsTable history={HISTORY} timeZone="America/Sao_Paulo" />, { container: app });

    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('SiteBuildsTable paginado (#873)', () => {
  const many = (count: number): SiteHistoryItem[] =>
    Array.from({ length: count }, (_, index) =>
      execution({
        id: index + 1,
        at: new Date(Date.UTC(2026, 9, 11, 16, 59 - index)),
        versionId: `v-${index}`,
      }),
    );
  /** Os ids de versão dos itens visíveis da linha do tempo (a primeira lista; a segunda é a paginação). */
  const versions = () =>
    within(screen.getAllByRole('list')[0]!)
      .getAllByRole('listitem')
      .map((item) => /v-\d+/.exec(item.textContent ?? '')?.[0]);

  it('com até 10 itens, mostra todos e sem paginação', () => {
    render(<SiteBuildsTable history={many(HISTORY_PAGE_SIZE)} timeZone="UTC" />, {
      container: app,
    });

    expect(versions()).toHaveLength(10);
    expect(screen.queryByRole('navigation', { name: 'Paginação' })).toBeNull();
  });

  it('com mais de 10, os 10 mais recentes primeiro e a paginação leva aos seguintes', async () => {
    const user = userEvent.setup();
    render(<SiteBuildsTable history={many(23)} timeZone="UTC" />, { container: app });

    expect(versions()).toEqual(Array.from({ length: 10 }, (_, index) => `v-${index}`));
    const pagination = screen.getByRole('navigation', { name: 'Paginação' });
    expect(within(pagination).getByRole('button', { name: 'Página 3' })).toBeTruthy();

    await user.click(within(pagination).getByRole('button', { name: 'Página 3' }));
    expect(versions()).toEqual(['v-20', 'v-21', 'v-22']);
  });

  it('o polling troca o histórico e a página escolhida fica; se sumir, vai para a última', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<SiteBuildsTable history={many(23)} timeZone="UTC" />, {
      container: app,
    });
    await user.click(screen.getByRole('button', { name: 'Página 2' }));

    rerender(<SiteBuildsTable history={many(24)} timeZone="UTC" />);
    expect(versions()[0]).toBe('v-10');

    rerender(<SiteBuildsTable history={many(5)} timeZone="UTC" />);
    expect(versions()).toHaveLength(5);
  });
});
