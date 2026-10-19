// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Switcher } from './index.tsx';

// Switcher do Ecme (#315): <input type="checkbox" role="switch"> dentro do <label>, sempre
// controlado pelo estado do componente, com o texto interno fora da árvore de acessibilidade.

afterEach(cleanup);

describe('Switcher', () => {
  it('role="switch" com o nome do aria-label; clique alterna e chama onChange', async () => {
    const onChange = vi.fn();
    render(<Switcher aria-label="Publicar" onChange={onChange} />);

    const switcher = screen.getByRole('switch', { name: 'Publicar' });
    expect(switcher).toHaveProperty('checked', false);
    expect(switcher.closest('label')?.className).not.toContain('switcher-checked');
    await userEvent.click(switcher);
    expect(switcher).toHaveProperty('checked', true);
    expect(switcher.closest('label')?.className).toContain('switcher-checked');
    expect(switcher.closest('label')?.className).toContain('bg-primary');
    expect(onChange).toHaveBeenLastCalledWith(true, expect.anything());
  });

  it('Espaço alterna o campo em foco', async () => {
    render(<Switcher aria-label="Destaque" defaultChecked />);

    const switcher = screen.getByRole('switch', { name: 'Destaque' });
    expect(switcher).toHaveProperty('checked', true);
    switcher.focus();
    await userEvent.keyboard(' ');
    expect(switcher).toHaveProperty('checked', false);
    await userEvent.keyboard(' ');
    expect(switcher).toHaveProperty('checked', true);
  });

  it('controlado: segue o checked da prop e não muda sozinho', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Switcher checked={false} aria-label="Ativo" onChange={onChange} />,
    );

    const switcher = screen.getByRole('switch', { name: 'Ativo' });
    await userEvent.click(switcher);
    expect(onChange).toHaveBeenLastCalledWith(true, expect.anything());
    expect(switcher).toHaveProperty('checked', false);

    rerender(<Switcher checked aria-label="Ativo" onChange={onChange} />);
    expect(switcher).toHaveProperty('checked', true);
  });

  it('controlado pelo pai: o estado anunciado acompanha o desenhado', async () => {
    function Notificacoes() {
      const [ligado, setLigado] = useState(false);
      return <Switcher aria-label="Notificações" checked={ligado} onChange={setLigado} />;
    }
    render(<Notificacoes />);

    const switcher = screen.getByRole('switch', { name: 'Notificações' });
    await userEvent.click(switcher);
    expect(switcher).toHaveProperty('checked', true);
    expect(switcher.closest('label')?.className).toContain('switcher-checked');
  });

  it('checkedContent e unCheckedContent seguem o estado, sem virar o nome do campo', async () => {
    render(<Switcher aria-label="Comentários" checkedContent="Sim" unCheckedContent="Não" />);

    const switcher = screen.getByRole('switch', { name: 'Comentários' });
    const content = switcher.closest('label')?.querySelector('.switcher-content');
    expect(content?.textContent).toBe('Não');
    expect(content?.getAttribute('aria-hidden')).toBe('true');
    await userEvent.click(switcher);
    expect(content?.textContent).toBe('Sim');
  });

  it('disabled, readOnly e isLoading não alternam nem chamam onChange', async () => {
    const onChange = vi.fn();
    render(
      <>
        <Switcher aria-label="Desabilitado" disabled onChange={onChange} />
        <Switcher aria-label="Somente leitura" readOnly onChange={onChange} />
        <Switcher aria-label="Carregando" isLoading onChange={onChange} />
      </>,
    );

    const disabled = screen.getByRole('switch', { name: 'Desabilitado' });
    expect(disabled).toHaveProperty('disabled', true);
    expect(disabled.closest('label')?.className).toContain('switcher-disabled');
    for (const name of ['Desabilitado', 'Somente leitura', 'Carregando']) {
      await userEvent.click(screen.getByRole('switch', { name }));
      expect(screen.getByRole('switch', { name })).toHaveProperty('checked', false);
    }
    expect(onChange).not.toHaveBeenCalled();
    expect(
      screen
        .getByRole('switch', { name: 'Carregando' })
        .closest('label')
        ?.querySelector('.switcher-toggle-loading'),
    ).not.toBeNull();
  });

  it('repassa o ref ao <input>', () => {
    let element: HTMLInputElement | null = null;
    render(
      <Switcher
        ref={(node) => {
          element = node;
        }}
        aria-label="Com ref"
      />,
    );

    expect(element).toBe(screen.getByRole('switch', { name: 'Com ref' }));
  });
});
