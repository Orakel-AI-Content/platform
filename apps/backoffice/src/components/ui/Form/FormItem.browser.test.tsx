import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { audit, REDUCED_MOTIONS, setReducedMotion } from '../../../../test/browser/a11y.ts';
import { renderUi } from '../../../../test/browser/render.tsx';
import { Button } from '../Button';
import { Input } from '../Input';
import { FormContainer, FormItem } from './index.tsx';

// FormItem em Chromium (#457; da vitrine, #207): rótulo e mensagem de erro ligados ao campo,
// com aria-invalid, e a transição da mensagem que respeita o movimento reduzido.

function Fields() {
  const [emailChecked, setEmailChecked] = useState(false);
  return (
    <section aria-label="Form">
      <FormContainer className="form-width">
        <FormItem label="Slug" asterisk invalid errorMessage="O slug já está em uso">
          <Input required defaultValue="inicio" />
        </FormItem>
        <FormItem label="E-mail" invalid={emailChecked} errorMessage="Informe um e-mail válido">
          <Input type="email" defaultValue="editor@" />
        </FormItem>
        <Button onClick={() => setEmailChecked((checked) => !checked)}>
          {emailChecked ? 'Limpar validação' : 'Validar e-mail'}
        </Button>
      </FormContainer>
      <FormContainer layout="horizontal" labelWidth={120} className="form-width">
        <FormItem label="Autor">
          <Input placeholder="Nome de quem assina" />
        </FormItem>
      </FormContainer>
    </section>
  );
}

/**
 * A opacidade da mensagem a cada quadro, do momento em que ela entra no DOM até 400 ms depois
 * (a transição do Ecme dura 150 ms). Valores intermediários são a animação.
 */
function sampleMessageOpacity(region: Element, text: string, trigger: () => void) {
  return new Promise<number[]>((resolve) => {
    const values: number[] = [];
    const observer = new MutationObserver(() => {
      const message = [...region.querySelectorAll('.form-explain')].find(
        (element) => element.textContent === text,
      );
      if (!message) return;
      observer.disconnect();
      const start = performance.now();
      const sample = () => {
        values.push(Number(getComputedStyle(message).opacity));
        if (performance.now() - start < 400) requestAnimationFrame(sample);
        else resolve(values);
      };
      sample();
    });
    observer.observe(region, { childList: true, subtree: true });
    trigger();
  });
}

describe('FormItem no navegador', () => {
  it('liga rótulo e mensagem de erro ao campo, com aria-invalid', async () => {
    const screen = await renderUi(<Fields />);

    const slug = screen.getByRole('textbox', { name: 'Slug' });
    await expect.element(slug).toHaveAttribute('aria-invalid', 'true');
    await expect.element(slug).toHaveAccessibleDescription('O slug já está em uso');

    const email = screen.getByRole('textbox', { name: 'E-mail' });
    await expect.element(email).not.toHaveAttribute('aria-invalid');
    await expect.element(email).toHaveAccessibleDescription('');

    await screen.getByRole('button', { name: 'Validar e-mail' }).click();
    await expect.element(email).toHaveAttribute('aria-invalid', 'true');
    await expect.element(email).toHaveAccessibleDescription('Informe um e-mail válido');

    // Com o erro na tela, sem violação do axe (depois da transição, que mistura a cor com o
    // fundo enquanto a opacidade sobe).
    await expect
      .element(screen.getByText('Informe um e-mail válido'))
      .toHaveStyle({ opacity: '1' });
    expect(await audit()).toEqual([]);

    await screen.getByRole('button', { name: 'Limpar validação' }).click();
    await expect.element(email).not.toHaveAttribute('aria-invalid');
    await expect.element(screen.getByText('Informe um e-mail válido')).not.toBeInTheDocument();
  });

  it.each(REDUCED_MOTIONS)(
    'a mensagem de erro aparece com ou sem transição conforme reducedMotion %s',
    async (reducedMotion) => {
      await setReducedMotion(reducedMotion);
      const screen = await renderUi(<Fields />);
      const region = screen.getByRole('region', { name: 'Form' }).element();
      const toggle = screen.getByRole('button', { name: 'Validar e-mail' }).element();

      const samples = await sampleMessageOpacity(region, 'Informe um e-mail válido', () =>
        (toggle as HTMLButtonElement).click(),
      );

      const intermediate = samples.filter((value) => value > 0 && value < 1);
      expect(samples.at(-1)).toBe(1);
      if (reducedMotion === 'reduce') expect(intermediate).toEqual([]);
      else expect(intermediate.length).toBeGreaterThan(0);
    },
  );
});
