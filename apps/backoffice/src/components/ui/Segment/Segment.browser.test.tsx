import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';

import {
  audit,
  COLOR_SCHEMES,
  focusRing,
  outline,
  setTheme,
  tabTo,
} from '../../../../test/browser/a11y.ts';
import { renderUi } from '../../../../test/browser/render.tsx';
import { Segment, type SegmentValue } from './index.tsx';

// Segment em Chromium (#457; da vitrine, #315): botões alternáveis; Enter e Espaço trocam o
// pressionado, com o foco de 2px (no escuro, primary-mild: o --ring sobre o trilho gray-700
// dá 2,91:1).

function Segments() {
  const [visualizacao, setVisualizacao] = useState<SegmentValue>('lista');
  const [canais, setCanais] = useState<SegmentValue>(['site']);
  return (
    <section aria-label="Segment">
      <Segment
        aria-label="Visualização"
        value={visualizacao}
        onChange={(value) => setVisualizacao(value)}
      >
        <Segment.Item value="lista">Lista</Segment.Item>
        <Segment.Item value="grade">Grade</Segment.Item>
        <Segment.Item value="calendario" disabled>
          Calendário
        </Segment.Item>
      </Segment>
      <Segment
        aria-label="Canais"
        size="sm"
        selectionType="multiple"
        value={canais}
        onChange={(value) => setCanais(value)}
      >
        <Segment.Item value="site">Site</Segment.Item>
        <Segment.Item value="newsletter">Newsletter</Segment.Item>
        <Segment.Item value="redes">Redes</Segment.Item>
      </Segment>
      <p role="status">
        Visualização: {String(visualizacao)}. Canais:{' '}
        {canais.length === 0 ? 'nenhum' : [canais].flat().join(', ')}.
      </p>
    </section>
  );
}

describe.each(COLOR_SCHEMES)('Segment no navegador (%s)', (scheme) => {
  it('pelo teclado, com foco de 2px e sem violação do axe', async () => {
    await setTheme(scheme);
    const screen = await renderUi(<Segments />);
    expect(await audit(screen.container)).toEqual([]);

    const visualizacao = screen.getByRole('group', { name: 'Visualização' });
    const lista = visualizacao.getByRole('button', { name: 'Lista' });
    const grade = visualizacao.getByRole('button', { name: 'Grade' });
    await expect.element(lista).toHaveAttribute('aria-pressed', 'true');
    await tabTo(grade);
    await expect
      .poll(() => outline(grade))
      .toEqual(focusRing(scheme === 'dark' ? '--primary-mild' : '--ring'));
    await userEvent.keyboard('{Enter}');
    await expect.element(grade).toHaveAttribute('aria-pressed', 'true');
    await expect.element(lista).toHaveAttribute('aria-pressed', 'false');
    await expect.element(visualizacao.getByRole('button', { name: 'Calendário' })).toBeDisabled();

    const canais = screen.getByRole('group', { name: 'Canais' });
    const newsletter = canais.getByRole('button', { name: 'Newsletter' });
    await tabTo(newsletter);
    await userEvent.keyboard(' ');
    await expect.element(newsletter).toHaveAttribute('aria-pressed', 'true');
    await expect
      .element(canais.getByRole('button', { name: 'Site' }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect
      .element(screen.getByRole('status'))
      .toHaveTextContent('Visualização: grade. Canais: site, newsletter.');
    await userEvent.keyboard(' ');
    await expect.element(newsletter).toHaveAttribute('aria-pressed', 'false');
  });
});
