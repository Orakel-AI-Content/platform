import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';

import { renderUi } from '../../../../test/browser/render.tsx';
import { Checkbox, type CheckboxGroupValue } from './index.tsx';

// Checkbox em Chromium (#457; da vitrine, #208): alterna com Espaço e expõe o estado ao leitor
// de tela, inclusive o misto e o do grupo.

function Checkboxes() {
  const [formatos, setFormatos] = useState<CheckboxGroupValue>(['texto']);
  return (
    <section aria-label="Checkbox">
      <Checkbox>Destaque na capa</Checkbox>
      <Checkbox defaultChecked>Publicado</Checkbox>
      <Checkbox checked indeterminate>
        Todas as seções
      </Checkbox>
      <Checkbox disabled>Arquivado</Checkbox>
      <p id="formatos">Formatos</p>
      <Checkbox.Group
        aria-labelledby="formatos"
        value={formatos}
        onChange={(value) => setFormatos(value)}
      >
        <Checkbox value="texto">Texto</Checkbox>
        <Checkbox value="video">Vídeo</Checkbox>
        <Checkbox value="audio">Áudio</Checkbox>
      </Checkbox.Group>
      <p role="status">
        Formatos escolhidos: {formatos.length === 0 ? 'nenhum' : formatos.join(', ')}.
      </p>
    </section>
  );
}

describe('Checkbox no navegador', () => {
  it('Checkbox e Checkbox.Group alternam com Espaço e expõem o estado', async () => {
    const screen = await renderUi(<Checkboxes />);

    const destaque = screen.getByRole('checkbox', { name: 'Destaque na capa' });
    await expect.element(destaque).not.toBeChecked();
    (destaque.element() as HTMLElement).focus();
    await userEvent.keyboard(' ');
    await expect.element(destaque).toBeChecked();
    await userEvent.keyboard(' ');
    await expect.element(destaque).not.toBeChecked();

    await expect.element(screen.getByRole('checkbox', { name: 'Publicado' })).toBeChecked();
    // `indeterminate` nativo: o leitor de tela anuncia "misto".
    await expect
      .element(screen.getByRole('checkbox', { name: 'Todas as seções' }))
      .toBePartiallyChecked();
    await expect.element(screen.getByRole('checkbox', { name: 'Arquivado' })).toBeDisabled();

    const formatos = screen.getByRole('group', { name: 'Formatos' });
    const status = screen.getByRole('status');
    await expect.element(status).toHaveTextContent('Formatos escolhidos: texto.');
    const video = formatos.getByRole('checkbox', { name: 'Vídeo' });
    (video.element() as HTMLElement).focus();
    await userEvent.keyboard(' ');
    await expect.element(video).toBeChecked();
    await expect.element(status).toHaveTextContent('Formatos escolhidos: texto, video.');
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    await expect.element(formatos.getByRole('checkbox', { name: 'Texto' })).toHaveFocus();
    await userEvent.keyboard(' ');
    await expect.element(status).toHaveTextContent('Formatos escolhidos: video.');
  });
});
