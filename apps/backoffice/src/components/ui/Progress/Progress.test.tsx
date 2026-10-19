// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Progress } from './index.tsx';

// Progress do Ecme (#321): o contêiner é o `role="progressbar"` com o valor de 0 a 100 e o nome
// de `aria-label`/`aria-labelledby`, nas variantes linha e círculo.

afterEach(cleanup);

describe('Progress', () => {
  it('linha: progressbar com valor, mínimo, máximo e o nome do aria-label', () => {
    render(<Progress percent={40} aria-label="Envio de capa.jpg" />);

    const progress = screen.getByRole('progressbar', { name: 'Envio de capa.jpg' });
    expect(progress.getAttribute('aria-valuenow')).toBe('40');
    expect(progress.getAttribute('aria-valuemin')).toBe('0');
    expect(progress.getAttribute('aria-valuemax')).toBe('100');
    expect(progress.textContent).toBe('40%');
    expect(progress.querySelector('.progress-bg')?.getAttribute('style')).toContain('width: 40%');
  });

  it('círculo: mesmo papel, nome por aria-labelledby e o svg fora da árvore de acessibilidade', () => {
    render(
      <>
        <span id="rotulo">Build do site</span>
        <Progress variant="circle" percent={75} aria-labelledby="rotulo" />
      </>,
    );

    const progress = screen.getByRole('progressbar', { name: 'Build do site' });
    expect(progress.getAttribute('aria-valuenow')).toBe('75');
    expect(progress.textContent).toBe('75%');
    expect(progress.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('customInfo troca o texto do percentual; showInfo=false o esconde', () => {
    const { rerender } = render(
      <Progress percent={10} customInfo="1 de 10" aria-label="Arquivos" />,
    );
    expect(screen.getByRole('progressbar', { name: 'Arquivos' }).textContent).toBe('1 de 10');

    rerender(<Progress percent={10} showInfo={false} aria-label="Arquivos" />);
    expect(screen.getByRole('progressbar', { name: 'Arquivos' }).textContent).toBe('');
  });

  it('percent padrão é 0', () => {
    render(<Progress aria-label="Fila" />);
    expect(screen.getByRole('progressbar', { name: 'Fila' }).getAttribute('aria-valuenow')).toBe(
      '0',
    );
  });
});
