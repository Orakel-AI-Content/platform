// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { LifecycleSteps } from './LifecycleSteps.tsx';
import { LifecycleAction, LifecycleActionScope } from './SiteActions.tsx';
import type { ActionResult } from '@/components/shared/actionResult.ts';
import type { SiteSummary } from '@/domain/sites/sites.ts';

// Conteúdo da etapa "Infra e zona" do painel da aba "Publicação" (#647): o ciclo de vida em
// texto e a ação manual do passo seguinte, com o erro no Alert do escopo.

afterEach(cleanup);

type Lifecycle = SiteSummary['lifecycle'];

const withAction = (
  lifecycle: Lifecycle,
  action = (): Promise<ActionResult> => Promise.resolve({ ok: true, message: '' }),
) => (
  <LifecycleActionScope>
    <LifecycleSteps
      current={lifecycle}
      action={<LifecycleAction lifecycle={lifecycle} action={action} />}
    />
  </LifecycleActionScope>
);

describe('etapa Infra e zona', () => {
  it.each([
    ['cadastrado', 'Infra e zona pendentes'],
    ['infra_aplicada', 'Infra aplicada, zona pendente'],
    ['zona_ativa', 'Infra aplicada e zona ativa'],
    ['publicado', 'Infra aplicada e zona ativa'],
  ] as const)('em %s mostra "%s"', (lifecycle, text) => {
    render(<LifecycleSteps current={lifecycle} />);

    expect(screen.getByText(text)).not.toBeNull();
  });

  it.each([
    ['cadastrado', 'Marcar infra aplicada'],
    ['infra_aplicada', 'Marcar zona ativa'],
  ] as const)('em %s mostra a ação "%s"', (lifecycle, name) => {
    render(withAction(lifecycle));

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([name]);
  });

  it.each(['zona_ativa', 'publicado'] as const)(
    'em %s nenhuma ação manual aparece',
    (lifecycle) => {
      render(withAction(lifecycle));

      expect(screen.queryByRole('button')).toBeNull();
    },
  );

  it('o erro da ação continua no Alert quando a revalidação troca o botão', async () => {
    const user = userEvent.setup();
    const action = (): Promise<ActionResult> =>
      Promise.resolve({ ok: false, message: 'A etapa anterior não foi concluída.' });
    const { rerender } = render(withAction('cadastrado', action));
    const region = screen.getByRole('alert');

    await user.click(screen.getByRole('button', { name: 'Marcar infra aplicada' }));
    await waitFor(() => expect(region.textContent).toBe('A etapa anterior não foi concluída.'));

    rerender(withAction('infra_aplicada', action));
    expect(screen.getByRole('alert').textContent).toBe('A etapa anterior não foi concluída.');
    expect(screen.getByRole('button', { name: 'Marcar zona ativa' })).not.toBeNull();
  });
});
