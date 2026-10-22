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
import { Radio, type RadioValue } from './index.tsx';

// Radio em Chromium (#457; da vitrine, #315): uma parada só no Tab, as setas trocam a escolha
// e pulam a desabilitada, com o foco de 2px.

function Radios() {
  const [tema, setTema] = useState<RadioValue>('claro');
  return (
    <section aria-label="Radio">
      <p id="tema">Tema do site</p>
      <Radio.Group
        aria-labelledby="tema"
        name="tema"
        value={tema}
        onChange={(value) => setTema(value)}
      >
        <Radio value="claro">Claro</Radio>
        <Radio value="escuro">Escuro</Radio>
        <Radio value="sistema">Sistema</Radio>
        <Radio value="alto-contraste" disabled>
          Alto contraste
        </Radio>
      </Radio.Group>
      <p role="status">Tema escolhido: {tema}.</p>
      <Radio.Group aria-label="Frequência" vertical value="semanal">
        <Radio value="diaria">Diária</Radio>
        <Radio value="semanal">Semanal</Radio>
      </Radio.Group>
    </section>
  );
}

describe.each(COLOR_SCHEMES)('Radio no navegador (%s)', (scheme) => {
  it('pelo teclado, com foco de 2px e sem violação do axe', async () => {
    await setTheme(scheme);
    const screen = await renderUi(<Radios />);
    expect(await audit(screen.container)).toEqual([]);

    const tema = screen.getByRole('radiogroup', { name: 'Tema do site' });
    const claro = tema.getByRole('radio', { name: 'Claro' });
    await expect.element(claro).toBeChecked();
    await tabTo(claro);
    await expect.poll(() => outline(claro)).toEqual(focusRing());
    await userEvent.keyboard('{ArrowDown}');
    await expect.element(tema.getByRole('radio', { name: 'Escuro' })).toBeChecked();
    await expect.element(tema.getByRole('radio', { name: 'Escuro' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    await expect.element(tema.getByRole('radio', { name: 'Sistema' })).toBeChecked();
    await expect.element(screen.getByRole('status')).toHaveTextContent('Tema escolhido: sistema.');
    await userEvent.keyboard('{ArrowDown}');
    await expect.element(claro).toBeChecked();
    await expect.element(tema.getByRole('radio', { name: 'Alto contraste' })).toBeDisabled();
    await userEvent.keyboard('{Tab}');
    await expect
      .element(
        screen
          .getByRole('radiogroup', { name: 'Frequência' })
          .getByRole('radio', { name: 'Semanal' }),
      )
      .toHaveFocus();
  });
});
