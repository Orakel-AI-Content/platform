import { describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import {
  audit,
  COLOR_SCHEMES,
  REDUCED_MOTIONS,
  setReducedMotion,
  setTheme,
  tabTo,
} from '../../../../test/browser/a11y.ts';
import { renderUi } from '../../../../test/browser/render.tsx';
import { Button } from '../Button';
import { Tooltip } from './index.tsx';

// Tooltip em Chromium (#458; da vitrine, #211) sobre o floating-ui: abre no hover e no foco do
// teclado, descreve o gatilho por aria-describedby, fecha com Esc, aceita o ponteiro sobre a
// dica (1.4.13) e não anima com movimento reduzido.

function Tooltips() {
  return (
    // Gatilhos em coluna e afastados: o ponteiro que vai de um até a dica dele nunca passa
    // pelo outro.
    <section aria-label="Tooltip" className="flex flex-col items-start gap-32 p-12">
      <Tooltip title="Copia o endereço público do artigo">
        <Button>Copiar link</Button>
      </Tooltip>
      <Tooltip title="Abre o artigo publicado" placement="bottom">
        <Button variant="plain">Ver no site</Button>
      </Tooltip>
    </section>
  );
}

const DESCRIPTION = 'Copia o endereço público do artigo';

describe('Tooltip no navegador', () => {
  it('no hover: descreve o gatilho, aceita o ponteiro sobre a dica e fecha com Esc', async () => {
    const screen = await renderUi(<Tooltips />);
    const trigger = screen.getByRole('button', { name: 'Copiar link' });

    await expect.element(trigger).not.toHaveAttribute('aria-describedby');
    await userEvent.hover(trigger);
    const tooltip = page.getByRole('tooltip');
    await expect.element(tooltip).toHaveTextContent(DESCRIPTION);
    await expect.element(trigger).toHaveAttribute('aria-describedby', tooltip.element().id);
    await expect.element(trigger).toHaveAccessibleDescription(DESCRIPTION);

    // Do gatilho até a dica, a dica continua aberta. O hover mira a dica já posicionada e opaca.
    await expect.poll(() => getComputedStyle(tooltip.element()).opacity).toBe('1');
    await userEvent.hover(tooltip);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect.element(tooltip).toBeVisible();

    await userEvent.keyboard('{Escape}');
    await expect.element(tooltip).not.toBeInTheDocument();
    await expect.element(trigger).not.toHaveAttribute('aria-describedby');
  });

  it('no foco do teclado: Esc fecha e o foco fica no gatilho', async () => {
    const screen = await renderUi(<Tooltips />);
    const trigger = screen.getByRole('button', { name: 'Copiar link' });

    await tabTo(trigger);
    const tooltip = page.getByRole('tooltip');
    await expect.element(tooltip).toHaveTextContent(DESCRIPTION);
    await expect.element(trigger).toHaveAttribute('aria-describedby', tooltip.element().id);

    await userEvent.keyboard('{Escape}');
    await expect.element(tooltip).not.toBeInTheDocument();
    await expect.element(trigger).toHaveFocus();
    await expect.element(trigger).not.toHaveAttribute('aria-describedby');

    // O próximo gatilho abre a dica dele.
    await userEvent.keyboard('{Tab}');
    await expect.element(screen.getByRole('button', { name: 'Ver no site' })).toHaveFocus();
    await expect.element(page.getByRole('tooltip')).toHaveTextContent('Abre o artigo publicado');
  });

  it.each(REDUCED_MOTIONS)(
    'aparece com ou sem transição conforme reducedMotion %s',
    async (motion) => {
      await setReducedMotion(motion);
      const screen = await renderUi(<Tooltips />);

      // A opacidade da dica a cada quadro, do momento em que ela entra no DOM até 400 ms depois
      // (a transição do Ecme dura 150 ms). Valores intermediários são a animação.
      const sampled = new Promise<number[]>((resolve) => {
        const values: number[] = [];
        const observer = new MutationObserver(() => {
          const tooltip = document.querySelector<HTMLElement>('[role="tooltip"]');
          if (!tooltip) return;
          observer.disconnect();
          const start = performance.now();
          const sample = () => {
            values.push(Number(getComputedStyle(tooltip).opacity));
            if (performance.now() - start < 400) requestAnimationFrame(sample);
            else resolve(values);
          };
          requestAnimationFrame(sample);
        });
        observer.observe(document.body, { childList: true, subtree: true });
      });
      await userEvent.hover(screen.getByRole('button', { name: 'Copiar link' }));
      const samples = await sampled;

      const intermediate = samples.filter((value) => value > 0 && value < 1);
      expect(samples.at(-1)).toBe(1);
      if (motion === 'reduce') {
        expect(samples[0]).toBe(1);
        expect(intermediate).toEqual([]);
      } else {
        expect(intermediate.length).toBeGreaterThan(0);
      }
    },
  );
});

describe.each(COLOR_SCHEMES)('Tooltip no navegador (%s)', (scheme) => {
  it('visível sem violação do axe', async () => {
    await setTheme(scheme);
    const screen = await renderUi(<Tooltips />);

    await userEvent.hover(screen.getByRole('button', { name: 'Copiar link' }));
    await expect.element(page.getByRole('tooltip')).toBeVisible();
    // O `audit` espera a transição de entrada (150 ms), que mistura a cor do texto com o fundo.
    expect(await audit()).toEqual([]);
  });
});
