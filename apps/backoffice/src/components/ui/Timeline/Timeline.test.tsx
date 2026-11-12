// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Timeline } from './index.tsx';

// Timeline do Ecme (#646): lista <ul> de <li> na ordem recebida, o marcador (padrão ou `media`)
// e o conector fora da árvore de acessibilidade.

afterEach(cleanup);

/** O texto que chega ao leitor de tela: o conteúdo sem o que está `aria-hidden`. */
function spoken(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement;
  for (const hidden of clone.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
  return clone.textContent ?? '';
}

function Historico() {
  return (
    <Timeline>
      <Timeline.Item>Publicação concluída</Timeline.Item>
      <Timeline.Item media={<span>●</span>}>Reversão para a v40</Timeline.Item>
      <Timeline.Item>Publicação com falha</Timeline.Item>
      {false}
      {null}
    </Timeline>
  );
}

describe('Timeline', () => {
  it('renderiza os itens como lista, na ordem recebida, sem os filhos vazios', () => {
    render(<Historico />);

    const list = screen.getByRole('list');
    expect(list.tagName).toBe('UL');
    expect(within(list).getAllByRole('listitem').map(spoken)).toEqual([
      'Publicação concluída',
      'Reversão para a v40',
      'Publicação com falha',
    ]);
  });

  it('deixa o marcador (padrão ou `media`) e o conector fora da árvore de acessibilidade', () => {
    render(<Historico />);

    const items = screen.getAllByRole('listitem');
    expect(items.map(spoken)).toEqual([
      'Publicação concluída',
      'Reversão para a v40',
      'Publicação com falha',
    ]);
    for (const item of items) {
      const media = item.firstElementChild?.firstElementChild;
      expect(media?.getAttribute('aria-hidden')).toBe('true');
    }
    expect(spoken(items[1]!)).not.toContain('●');
  });
});
