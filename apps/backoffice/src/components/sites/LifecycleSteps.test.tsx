// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { LifecycleSteps } from './LifecycleSteps.tsx';
import { LifecycleAction, LifecycleActionScope } from './SiteActions.tsx';
import type { ActionResult } from '@/components/shared/actionResult.ts';
import type { SiteSummary } from '@/domain/sites/sites.ts';

// Ciclo de vida como sequência de etapas (#148) no Steps do Ecme (#369): ordem fixa, estado em
// texto, a atual com aria-current e a ação manual junto da etapa que ela conclui. A atual se
// distingue pelo ícone `step-item-icon-current` do template, sem o contorno do foco (#397).

afterEach(cleanup);

type Lifecycle = SiteSummary['lifecycle'];

const items = () => within(screen.getByRole('list')).getAllByRole('listitem');

/** O texto do item sem o que é `aria-hidden` (marcador, conector e o estado visível). */
const spokenText = (item: HTMLElement) => {
  const clone = item.cloneNode(true) as HTMLElement;
  for (const hidden of clone.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
  return clone.textContent;
};

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

describe('etapas do ciclo de vida', () => {
  it('mostra as quatro etapas do Steps em ordem com o estado em texto e a atual marcada', () => {
    render(<LifecycleSteps current="infra_aplicada" />);

    expect(screen.getByRole('list').tagName).toBe('OL');
    expect(screen.getByRole('list').classList).toContain('steps-vertical');
    expect(items().map((item) => item.classList.contains('step-item'))).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(items().map(spokenText)).toEqual([
      'Cadastrado (concluída)',
      'Infra aplicada (atual)',
      'Zona ativa (pendente)',
      'Publicado (pendente)',
    ]);
    expect(items().map((item) => item.getAttribute('aria-current'))).toEqual([
      null,
      'step',
      null,
      null,
    ]);
  });

  it('distingue a atual pelo ícone do template, sem contorno igual ao do foco', () => {
    render(<LifecycleSteps current="infra_aplicada" />);

    const icon = (item: HTMLElement | undefined) => item?.querySelector('.step-item-icon');
    expect(items().map((item) => icon(item)?.classList.contains('step-item-icon-current'))).toEqual(
      [false, true, false, false],
    );
    for (const element of items()[1]!.querySelectorAll('*')) {
      expect([...element.classList].filter((name) => /(^|:)outline-/.test(name))).toEqual([]);
    }
    expect(items()[1]?.getAttribute('aria-current')).toBe('step');
  });

  it('mostra o estado da atual e das pendentes na tela, fora do leitor de tela', () => {
    render(<LifecycleSteps current="infra_aplicada" />);

    // O sufixo visível fica no título, aria-hidden; o leitor de tela ouve só o sr-only do StepItem.
    const visibleState = (item: HTMLElement) =>
      item.querySelector('.step-item-title [aria-hidden="true"]')?.textContent ?? null;
    expect(items().map(visibleState)).toEqual([null, ' (atual)', ' (pendente)', ' (pendente)']);
    for (const item of items()) {
      expect(item.querySelectorAll('.sr-only')).toHaveLength(1);
    }
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

  it('o erro da ação continua no Alert abaixo da lista quando o botão muda de etapa', async () => {
    const user = userEvent.setup();
    const action = (): Promise<ActionResult> =>
      Promise.resolve({ ok: false, message: 'A etapa anterior não foi concluída.' });
    const { rerender } = render(withAction('cadastrado', action));
    const region = screen.getByRole('alert');

    await user.click(screen.getByRole('button', { name: 'Marcar infra aplicada' }));
    await waitFor(() => expect(region.textContent).toBe('A etapa anterior não foi concluída.'));
    expect(region.querySelector('.alert')).not.toBeNull();

    // Uma revalidação que traga a etapa seguinte remonta o botão em outro item.
    rerender(withAction('infra_aplicada', action));
    expect(screen.getByRole('alert').textContent).toBe('A etapa anterior não foi concluída.');
    expect(
      screen.getByRole('list').compareDocumentPosition(screen.getByRole('alert')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(items()[2]?.contains(screen.getByRole('button', { name: 'Marcar zona ativa' }))).toBe(
      true,
    );
  });
});
