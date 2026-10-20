// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import Spinner from './index.ts';

// Spinner do Ecme (#392): só indicador, fora da árvore de acessibilidade (quem usa anuncia o
// carregamento); `size` vira largura e altura, `isSpining` liga o giro e `indicator` troca o ícone.

afterEach(cleanup);

describe('Spinner', () => {
  it('padrão: svg oculto, 20 px, girando, na cor do tema', () => {
    const { container } = render(<Spinner />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.style.width).toBe('20px');
    expect(svg?.style.height).toBe('20px');
    expect(svg?.getAttribute('class')).toContain('animate-spin');
    expect(svg?.getAttribute('class')).toContain('text-primary');
  });

  it('size define largura e altura; isSpining={false} para o giro', () => {
    const { container } = render(<Spinner size={32} isSpining={false} />);
    const svg = container.querySelector('svg');
    expect(svg?.style.width).toBe('32px');
    expect(svg?.style.height).toBe('32px');
    expect(svg?.getAttribute('class')).not.toContain('animate-spin');
  });

  it('indicator troca o elemento, que continua oculto, e o ref chega até ele', () => {
    const ref = createRef<HTMLElement>();
    const { container } = render(<Spinner indicator="span" ref={ref} />);
    expect(container.querySelector('svg')).toBeNull();
    const indicator = container.querySelector('span');
    expect(indicator?.getAttribute('aria-hidden')).toBe('true');
    expect(ref.current).toBe(indicator);
  });

  it('o ref chega ao svg do ícone padrão', () => {
    const ref = createRef<HTMLElement>();
    const { container } = render(<Spinner ref={ref} />);
    expect(ref.current).toBe(container.querySelector('svg'));
  });
});
