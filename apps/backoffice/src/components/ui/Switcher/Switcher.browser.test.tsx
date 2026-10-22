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
import { Switcher } from './index.tsx';

// Switcher em Chromium (#457; da vitrine, #315): Tab chega ao <input role="switch">, Espaço
// alterna e o rótulo mostra o foco de 2px (o <input> fica só para o leitor de tela).

function Switchers() {
  const [comentarios, setComentarios] = useState(true);
  return (
    <section aria-label="Switcher">
      <Switcher
        aria-label="Comentários abertos"
        checked={comentarios}
        onChange={(checked) => setComentarios(checked)}
      />
      <Switcher aria-label="Destaque na home" defaultChecked />
      <Switcher
        aria-label="Newsletter"
        checkedContent="Sim"
        unCheckedContent="Não"
        defaultChecked
      />
      <Switcher aria-label="Rascunho automático" checkedContent="Sim" unCheckedContent="Não" />
      <Switcher aria-label="Sincronizando" isLoading defaultChecked />
      <Switcher aria-label="Indisponível" disabled />
      <p role="status">Comentários {comentarios ? 'abertos' : 'fechados'}.</p>
    </section>
  );
}

describe.each(COLOR_SCHEMES)('Switcher no navegador (%s)', (scheme) => {
  it('pelo teclado, com foco de 2px no rótulo e sem violação do axe', async () => {
    await setTheme(scheme);
    const screen = await renderUi(<Switchers />);
    expect(await audit(screen.container)).toEqual([]);

    const comentarios = screen.getByRole('switch', { name: 'Comentários abertos' });
    const label = () => comentarios.element().parentElement!;
    await expect.element(comentarios).toBeChecked();
    await tabTo(comentarios);
    // As transições do Ecme animam também o contorno: a leitura espera assentar.
    await expect.poll(() => outline(label())).toEqual(focusRing());
    await userEvent.keyboard(' ');
    await expect.element(comentarios).not.toBeChecked();
    await expect.element(screen.getByRole('status')).toHaveTextContent('Comentários fechados.');
    expect(label().classList.contains('switcher-checked')).toBe(false);
    await userEvent.keyboard(' ');
    await expect.element(comentarios).toBeChecked();
    await expect.element(screen.getByRole('switch', { name: 'Indisponível' })).toBeDisabled();
  });
});
