// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Steps } from './index.tsx';

// Steps do Ecme (#321) com a semântica do LifecycleSteps: <ol> de <li>, o estado de cada etapa
// em texto, `aria-current="step"` na atual, ícones fora da árvore de acessibilidade e, com
// `onChange`, cada etapa como botão.

afterEach(cleanup);

/** O texto que chega ao leitor de tela: o conteúdo sem o que está `aria-hidden`. */
function spoken(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement;
  for (const hidden of clone.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
  return clone.textContent ?? '';
}

function Ciclo(props: { current?: number; status?: 'error'; onChange?: (index: number) => void }) {
  return (
    <Steps {...props}>
      <Steps.Item title="Criado" />
      <Steps.Item title="Configurado" />
      <Steps.Item title="Publicado" />
    </Steps>
  );
}

describe('Steps', () => {
  it('lista ordenada com o estado em texto e aria-current só na atual', () => {
    render(<Ciclo current={1} />);

    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(screen.getByRole('list').tagName).toBe('OL');
    expect(items.map(spoken)).toEqual([
      'Criado (concluída)',
      'Configurado (atual)',
      'Publicado (pendente)',
    ]);
    expect(items.map((item) => item.getAttribute('aria-current'))).toEqual([null, 'step', null]);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('ícones e conectores aria-hidden: o ✓ da concluída e o número das demais', () => {
    render(<Ciclo current={1} />);

    const [criado, configurado, publicado] = screen.getAllByRole('listitem');
    const icon = (item: HTMLElement) => item.querySelector('.step-item-icon')!;
    expect(icon(criado!).getAttribute('aria-hidden')).toBe('true');
    expect(icon(criado!).querySelector('svg')).not.toBeNull();
    expect(icon(configurado!).textContent).toBe('2');
    expect(icon(publicado!).textContent).toBe('3');
    for (const connector of document.querySelectorAll('.step-connect')) {
      expect(connector.getAttribute('aria-hidden')).toBe('true');
    }
    expect(publicado!.querySelector('.step-connect')).toBeNull();
  });

  it('status="error" marca a atual com erro, em texto e com o ✗', () => {
    render(<Ciclo current={2} status="error" />);

    const publicado = screen.getAllByRole('listitem')[2]!;
    expect(spoken(publicado)).toBe('Publicado (com erro)');
    expect(publicado.getAttribute('aria-current')).toBe('step');
    expect(publicado.querySelector('.step-item-icon svg')).not.toBeNull();
  });

  it('status do item prevalece sobre o calculado pelo current', () => {
    render(
      <Steps current={0}>
        <Steps.Item title="Rascunho" />
        <Steps.Item title="Revisão" status="complete" />
      </Steps>,
    );

    expect(screen.getAllByRole('listitem').map(spoken)).toEqual([
      'Rascunho (atual)',
      'Revisão (concluída)',
    ]);
  });

  it('com onChange, cada etapa é um botão: Tab chega e Enter e Espaço chamam onChange(index)', async () => {
    const onChange = vi.fn();
    render(<Ciclo current={0} onChange={onChange} />);

    const buttons = ['Criado (atual)', 'Configurado (pendente)', 'Publicado (pendente)'].map(
      (name) => screen.getByRole('button', { name }),
    );
    await userEvent.tab();
    await userEvent.tab();
    expect(document.activeElement).toBe(buttons[1]);
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(1);
    await userEvent.tab();
    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenLastCalledWith(2);
    await userEvent.click(buttons[0]!);
    expect(onChange).toHaveBeenLastCalledWith(0);
  });
});
