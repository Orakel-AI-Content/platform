// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import Modal from 'react-modal';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_ELEMENT_ID } from '@/components/ui/utils/modalApp';
import type { Rollout, RolloutSite } from '@/domain/releases/rollout.ts';

import { firstSiteId, RolloutButton, RolloutCard, rolloutProgress } from './RolloutCard.tsx';

// "Atualizar todos os sites" (#703): o botão desabilitado sem release disponível ou com uma
// atualização em andamento, a confirmação com a versão de destino e a recusa no diálogo; o
// cartão com o estado de cada site, o primeiro marcado e os pausados à parte.

const mocks = vi.hoisted(() => ({ pushSuccess: vi.fn() }));
vi.mock('@/components/shared/ActionFeedback.tsx', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  pushSuccess: mocks.pushSuccess,
}));

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

afterEach(() => {
  cleanup();
  app.remove();
  vi.clearAllMocks();
});

const site = (
  siteId: string,
  state: RolloutSite['state'],
  previousRelease: string | null = '1.4.0',
): RolloutSite => ({ siteId, position: 0, state, previousRelease });

const rollout = (sites: RolloutSite[], overrides: Partial<Rollout> = {}): Rollout => ({
  id: 1,
  targetRelease: '1.5.0',
  state: 'em_andamento',
  requestedBy: 'operacao@orakel.local',
  startedAt: new Date('2026-11-12T12:00Z'),
  finishedAt: null,
  interruptedBy: null,
  interruptedAt: null,
  sites: sites.map((s, position) => ({ ...s, position })),
  ...overrides,
});

/** O esboço do refinamento: 2 atualizados, 1 em andamento, 5 aguardando, 2 pausados. */
const sketch = rollout([
  site('site-x', 'nao_atualizado'),
  site('site-a', 'atualizado'),
  site('site-b', 'atualizado'),
  site('site-c', 'em_andamento'),
  site('site-d', 'aguardando'),
  site('site-e', 'aguardando'),
  site('site-f', 'aguardando'),
  site('site-g', 'aguardando'),
  site('site-h', 'aguardando'),
  site('site-y', 'nao_atualizado'),
]);

const NAME = 'Atualizar todos os sites para a 1.5.0?';

describe('rolloutProgress', () => {
  it('conta os sites alcançados entre os que não ficaram de fora', () => {
    expect(rolloutProgress(sketch)).toEqual({ reached: 3, total: 8 });
  });

  it('falhou conta como alcançado', () => {
    expect(
      rolloutProgress(
        rollout([site('a', 'atualizado'), site('b', 'falhou'), site('c', 'aguardando')]),
      ),
    ).toEqual({ reached: 2, total: 3 });
  });
});

describe('firstSiteId', () => {
  it('pula os pausados e os que já estavam no destino', () => {
    const value = rollout([
      site('pausado', 'nao_atualizado'),
      site('ja-no-destino', 'atualizado', '1.5.0'),
      site('canario', 'atualizado'),
      site('outro', 'em_andamento'),
    ]);
    expect(firstSiteId(value)).toBe('canario');
  });

  it('sem site promovido, nenhum', () => {
    expect(firstSiteId(rollout([site('a', 'nao_atualizado')]))).toBeUndefined();
  });
});

describe('RolloutCard', () => {
  const states = () =>
    within(screen.getByRole('list', { name: 'Sites da atualização' }))
      .getAllByRole('listitem')
      .map((item) => item.textContent);

  it('mostra versão, estado e "N de M", cada site com o estado e os pausados à parte', () => {
    render(<RolloutCard rollout={sketch} />);

    expect(screen.getByRole('status', { name: 'Progresso da atualização' }).textContent).toBe(
      'Atualização para 1.5.0 · em andamento · 3 de 8',
    );
    expect(states()).toEqual([
      'site-a (primeiro)Atualizado',
      'site-bAtualizado',
      'site-cEm andamento',
      'site-dAguardando',
      'site-eAguardando',
      'site-fAguardando',
      'site-gAguardando',
      'site-hAguardando',
    ]);
    expect(screen.getByText('Não atualizados (pausados): site-x, site-y')).toBeTruthy();
  });

  it('com um site em falha, a atualização falhou e o site aparece como falhou', () => {
    render(
      <RolloutCard
        rollout={rollout(
          [site('site-a', 'atualizado'), site('site-b', 'falhou'), site('site-c', 'aguardando')],
          { state: 'falhou' },
        )}
      />,
    );

    expect(screen.getByRole('status', { name: 'Progresso da atualização' }).textContent).toBe(
      'Atualização para 1.5.0 · falhou · 2 de 3',
    );
    expect(states()).toEqual(['site-a (primeiro)Atualizado', 'site-bFalhou', 'site-cAguardando']);
  });

  it('concluída, sem pausados, não mostra a linha dos não atualizados', () => {
    render(
      <RolloutCard
        rollout={rollout([site('site-a', 'atualizado'), site('site-b', 'atualizado')], {
          state: 'concluida',
        })}
      />,
    );

    expect(screen.getByRole('status', { name: 'Progresso da atualização' }).textContent).toBe(
      'Atualização para 1.5.0 · concluída · 2 de 2',
    );
    expect(screen.queryByText(/Não atualizados/)).toBeNull();
  });
});

describe('RolloutButton', () => {
  const button = () => screen.getByRole('button', { name: 'Atualizar todos os sites' });

  it('sem release disponível, fica desabilitado', () => {
    render(<RolloutButton target={null} running={false} action={vi.fn()} />);
    expect(button()).toHaveProperty('disabled', true);
  });

  it('com uma atualização em andamento, fica desabilitado', () => {
    render(<RolloutButton target="1.5.0" running action={vi.fn()} />);
    expect(button()).toHaveProperty('disabled', true);
  });

  it('pede confirmação com a versão de destino; cancelar não chama a action', async () => {
    const action = vi.fn();
    render(<RolloutButton target="1.5.0" running={false} action={action} />);

    await userEvent.click(button());
    const dialog = await screen.findByRole('alertdialog', { name: NAME });
    expect(dialog.textContent).toContain('A versão 1.5.0 vai aos sites um por vez');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(action).not.toHaveBeenCalled();
  });

  it('confirmado, chama a action, fecha e anuncia o sucesso', async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, message: 'Atualização iniciada.' });
    render(<RolloutButton target="1.5.0" running={false} action={action} />);

    await userEvent.click(button());
    const dialog = await screen.findByRole('alertdialog', { name: NAME });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Atualizar' }));

    expect(action).toHaveBeenCalledTimes(1);
    expect(mocks.pushSuccess).toHaveBeenCalledWith('Atualização iniciada.');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('a recusa do domínio aparece no diálogo, que continua aberto', async () => {
    const action = vi.fn().mockResolvedValue({
      ok: false,
      message: 'Já existe uma atualização de todos os sites em andamento',
    });
    render(<RolloutButton target="1.5.0" running={false} action={action} />);

    await userEvent.click(button());
    const dialog = await screen.findByRole('alertdialog', { name: NAME });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Atualizar' }));

    expect(await within(dialog).findByRole('alert')).toHaveProperty(
      'textContent',
      'Já existe uma atualização de todos os sites em andamento',
    );
    expect(mocks.pushSuccess).not.toHaveBeenCalled();
  });
});
