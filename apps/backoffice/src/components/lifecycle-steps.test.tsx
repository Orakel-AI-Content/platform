// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { LifecycleSteps } from './lifecycle-steps.tsx';
import { LifecycleAction, LifecycleActionScope } from './site-actions.tsx';
import type { SiteSummary } from '@/domain/sites/sites.ts';

// Ciclo de vida como sequência de etapas (#148): ordem fixa, estado em texto, a atual com
// aria-current e a ação manual junto da etapa que ela conclui.

afterEach(cleanup);

type Lifecycle = SiteSummary['lifecycle'];

const items = () => within(screen.getByRole('list')).getAllByRole('listitem');

const withAction = (
  lifecycle: Lifecycle,
  action = () => Promise.resolve({ ok: true, message: '' }),
) => (
  <LifecycleActionScope>
    <LifecycleSteps
      current={lifecycle}
      action={<LifecycleAction lifecycle={lifecycle} action={action} />}
    />
  </LifecycleActionScope>
);

describe('etapas do ciclo de vida', () => {
  it('mostra as quatro etapas em ordem com o estado em texto e a atual marcada', () => {
    render(<LifecycleSteps current="infra_aplicada" />);

    expect(screen.getByRole('list').tagName).toBe('OL');
    expect(items().map((item) => item.textContent)).toEqual([
      '1Cadastrado (concluída)',
      '2Infra aplicada (atual)',
      '3Zona ativa (pendente)',
      '4Publicado (pendente)',
    ]);
    expect(items().map((item) => item.getAttribute('aria-current'))).toEqual([
      null,
      'step',
      null,
      null,
    ]);
  });

  it('pinta o marcador de cada etapa com a cor do estado, nos tokens do Ecme', () => {
    render(<LifecycleSteps current="infra_aplicada" />);

    const marker = (index: number) => within(items()[index]!).getByText(String(index + 1));
    expect(marker(0).className).toContain('bg-primary');
    expect(marker(1).className).toContain('outline-primary');
    expect(marker(1).className).not.toContain('bg-primary');
    expect(marker(2).className).toContain('border-dashed');
  });

  it.each([
    ['cadastrado', 1, 'Marcar infra aplicada'],
    ['infra_aplicada', 2, 'Marcar zona ativa'],
  ] as const)('em %s a ação fica no item da etapa que ela conclui', (lifecycle, index, name) => {
    render(withAction(lifecycle));

    const button = screen.getByRole('button', { name });
    expect(items()[index]?.contains(button)).toBe(true);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it.each(['zona_ativa', 'publicado'] as const)(
    'em %s nenhuma ação manual aparece',
    (lifecycle) => {
      render(withAction(lifecycle));

      expect(screen.queryByRole('button')).toBeNull();
      expect(items()).toHaveLength(4);
    },
  );

  it('sem ação mostra só as etapas', () => {
    render(<LifecycleSteps current="cadastrado" />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('o retorno da ação continua em role=status quando o botão muda de etapa', async () => {
    const user = userEvent.setup();
    const action = () => Promise.resolve({ ok: true, message: 'Infra aplicada marcada.' });
    const { rerender } = render(withAction('cadastrado', action));

    await user.click(screen.getByRole('button', { name: 'Marcar infra aplicada' }));
    expect((await screen.findByRole('status')).textContent).toBe('Infra aplicada marcada.');

    // A página revalidada traz a etapa seguinte: o botão remonta em outro item.
    rerender(withAction('infra_aplicada', action));
    expect(screen.getByRole('status').textContent).toBe('Infra aplicada marcada.');
    expect(items()[2]?.contains(screen.getByRole('button', { name: 'Marcar zona ativa' }))).toBe(
      true,
    );
  });
});
