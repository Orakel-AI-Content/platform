import { useState } from 'react';
import { PiPlus } from 'react-icons/pi';
import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import { renderUi } from '../../../../test/browser/render.tsx';
import { tabTo } from '../../../../test/browser/a11y.ts';
import { Button } from './index.tsx';

// Button em Chromium (#457; da vitrine, #205): Enter e Espaço acionam, o desabilitado sai do
// Tab e o carregando anuncia que está ocupado.

function Buttons() {
  const [clicks, setClicks] = useState(0);
  return (
    <section aria-label="Button">
      <Button variant="solid" onClick={() => setClicks((count) => count + 1)}>
        Solid
      </Button>
      <Button variant="plain">Plain</Button>
      <Button>Default</Button>
      <Button variant="solid" icon={<PiPlus aria-hidden />}>
        Com ícone
      </Button>
      <Button icon={<PiPlus aria-hidden />} aria-label="Só ícone" />
      <Button variant="solid" loading>
        Carregando
      </Button>
      <Button disabled>Desabilitado</Button>
      <Button size="xs">Extra pequeno</Button>
      <p role="status">
        {clicks === 0 ? 'Nenhum clique no Solid.' : `Solid acionado ${clicks} vez(es).`}
      </p>
    </section>
  );
}

describe('Button no navegador', () => {
  it('aciona com Enter e com Espaço; desabilitado fica fora do Tab', async () => {
    const screen = await renderUi(<Buttons />);
    const status = screen.getByRole('status');

    await tabTo(screen.getByRole('button', { name: 'Solid' }));
    await userEvent.keyboard('{Enter}');
    await expect.element(status).toHaveTextContent('Solid acionado 1 vez(es).');
    await userEvent.keyboard(' ');
    await expect.element(status).toHaveTextContent('Solid acionado 2 vez(es).');

    await expect.element(screen.getByRole('button', { name: 'Desabilitado' })).toBeDisabled();
    const loading = screen.getByRole('button', { name: 'Carregando' });
    await expect.element(loading).toHaveAttribute('aria-busy', 'true');
    await expect.element(loading).toHaveAttribute('aria-disabled', 'true');

    // Do "Carregando" em diante, o Tab pula o desabilitado: o próximo é o "Extra pequeno".
    await tabTo(loading);
    await userEvent.keyboard('{Tab}');
    await expect.element(page.getByRole('button', { name: 'Extra pequeno' })).toHaveFocus();
  });
});
