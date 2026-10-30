import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';

import {
  audit,
  COLOR_SCHEMES,
  REDUCED_MOTIONS,
  setReducedMotion,
  setTheme,
} from '../../../../test/browser/a11y.ts';
import { appRoot } from '../../../../test/browser/dialog.ts';
import { renderInApp } from '../../../../test/browser/render.tsx';
import { Button } from '../Button';
import { Dialog } from '../Dialog';
import { Notification } from '../Notification';
import { toast } from './index.ts';

// toast em Chromium (#458; da vitrine, #212): sem raiz React própria, mostrado pelo
// ToastProvider numa região viva que já existe antes da mensagem, fora do contêiner da app (o
// `renderInApp` monta os dois como o layout raiz). O store do toast é do módulo: cada teste
// termina sem mensagem.

function Toasts() {
  const [dialogOpen, setDialogOpen] = useState(false);
  return (
    <section aria-label="Toast">
      <Button
        onClick={() =>
          toast.push(
            <Notification type="success" title="Rascunho salvo" closable duration={2000}>
              As alterações ficaram guardadas.
            </Notification>,
          )
        }
      >
        Mostrar toast de sucesso
      </Button>
      <Button
        onClick={() =>
          toast.push(
            <Notification type="danger" title="Falha ao publicar" duration={2000}>
              Tente de novo em instantes.
            </Notification>,
          )
        }
      >
        Mostrar toast de erro
      </Button>
      <Button onClick={() => setDialogOpen(true)}>Abrir Dialog</Button>
      <Dialog isOpen={dialogOpen} title="Editar autor" onClose={() => setDialogOpen(false)}>
        <Button
          size="sm"
          onClick={() =>
            toast.push(<Notification type="info" title="Aviso de dentro do diálogo" />)
          }
        >
          Mostrar aviso
        </Button>
      </Dialog>
    </section>
  );
}

const region = () => document.querySelector<HTMLElement>('[data-toast-placement="top-end"]')!;
const notifications = () => [...region().querySelectorAll('.notification')];

afterEach(() => {
  toast.removeAll();
});

describe('toast no navegador', () => {
  it('de sucesso aparece na região viva já montada e sai depois do duration', async () => {
    const screen = await renderInApp(<Toasts />);

    // A região da placement padrão existe, vazia, antes do primeiro toast.
    expect(region().getAttribute('role')).toBe('status');
    expect(region().textContent).toBe('');

    await screen.getByRole('button', { name: 'Mostrar toast de sucesso' }).click();
    await expect.poll(() => region().textContent).toContain('Rascunho salvo');
    const shownAt = Date.now();
    await expect
      .poll(() => region().textContent, { timeout: 5000 })
      .not.toContain('Rascunho salvo');
    // duration de 2 s: não sai antes, e sai logo depois.
    const elapsed = Date.now() - shownAt;
    expect(elapsed).toBeGreaterThan(1500);
    expect(elapsed).toBeLessThan(3500);
  });

  it('de erro vai num role="alert"; Fechar pelo teclado tira o de sucesso', async () => {
    const screen = await renderInApp(<Toasts />);

    await screen.getByRole('button', { name: 'Mostrar toast de erro' }).click();
    await expect
      .poll(() => region().querySelector('[role="alert"]')?.textContent)
      .toContain('Falha ao publicar');

    await screen.getByRole('button', { name: 'Mostrar toast de sucesso' }).click();
    await expect.poll(() => notifications().length).toBe(2);
    const success = notifications().find((item) => item.textContent?.includes('Rascunho salvo'))!;
    const close = page.elementLocator(success).getByRole('button', { name: 'Fechar' });
    (close.element() as HTMLElement).focus();
    await expect.element(close).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect.poll(() => region().textContent).not.toContain('Rascunho salvo');
  });

  it('disparado de dentro do Dialog fica fora do #app-root inerte', async () => {
    const screen = await renderInApp(<Toasts />);

    await screen.getByRole('button', { name: 'Abrir Dialog' }).click();
    const dialog = page.getByRole('dialog', { name: 'Editar autor' });
    await dialog.getByRole('button', { name: 'Mostrar aviso' }).click();
    expect(appRoot().inert).toBe(true);

    await expect.poll(() => region().textContent).toContain('Aviso de dentro do diálogo');
    const message = notifications()[0]!;
    expect({
      insideApp: message.closest('#app-root') !== null,
      inert: message.closest('[inert]') !== null,
      hidden: message.closest('[aria-hidden="true"]') !== null,
    }).toEqual({ insideApp: false, inert: false, hidden: false });
  });

  it.each(REDUCED_MOTIONS)(
    'aparece com ou sem transição conforme reducedMotion %s',
    async (motion) => {
      await setReducedMotion(motion);
      const screen = await renderInApp(<Toasts />);

      // A opacidade do item a cada quadro, do momento em que ele entra no DOM até 400 ms depois
      // (a transição do Ecme dura 150 ms). Valores intermediários são a animação.
      const sampled = new Promise<number[]>((resolve) => {
        const values: number[] = [];
        const observer = new MutationObserver(() => {
          const item = document.querySelector<HTMLElement>('.toast-wrapper');
          if (!item) return;
          observer.disconnect();
          const start = performance.now();
          const sample = () => {
            values.push(Number(getComputedStyle(item).opacity));
            if (performance.now() - start < 400) requestAnimationFrame(sample);
            else resolve(values);
          };
          requestAnimationFrame(sample);
        });
        observer.observe(document.body, { childList: true, subtree: true });
      });
      await screen.getByRole('button', { name: 'Mostrar toast de sucesso' }).click();
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

describe.each(COLOR_SCHEMES)('toast no navegador (%s)', (scheme) => {
  it('de sucesso e de erro visíveis sem violação do axe', async () => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    const screen = await renderInApp(<Toasts />);

    await screen.getByRole('button', { name: 'Mostrar toast de sucesso' }).click();
    await screen.getByRole('button', { name: 'Mostrar toast de erro' }).click();
    await expect.poll(() => notifications().length).toBe(2);
    expect(await audit()).toEqual([]);
  });
});
