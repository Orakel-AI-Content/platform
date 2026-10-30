import type { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';

import { FormsShowcase } from '@/app/(admin)/teste-de-componentes/forms-showcase.tsx';
import { toast } from '@/components/ui/toast';

import { audit, COLOR_SCHEMES, setReducedMotion, setTheme } from '../../../test/browser/a11y.ts';
import { renderInApp } from '../../../test/browser/render.tsx';

vi.mock('next/navigation', () => import('../../../test/browser/navigation.ts'));

// Rich text em Chromium (#459; da vitrine, #390): o popover de link aplica o endereço pelo
// teclado, recusa o inválido no próprio campo, reabre com "Remover link" sobre o link, e o Esc
// volta ao editor. A fixture é a seção da própria vitrine, com o envio no cliente.

const toastText = () =>
  document.querySelector('[data-toast-placement="top-end"]')?.textContent ?? '';

afterEach(() => {
  toast.removeAll();
});

describe.each(COLOR_SCHEMES)('rich text no navegador (%s)', (scheme) => {
  it('o popover de link aplica o endereço pelo teclado e o Esc volta ao editor, sem violação do axe', async () => {
    await setTheme(scheme);
    await setReducedMotion('reduce');
    const screen = await renderInApp(<FormsShowcase />);
    const rich = screen.getByRole('region', { name: 'Rich text e link' });
    const editor = rich.getByRole('textbox', { name: 'Corpo do texto' });
    const toolbar = rich.getByRole('toolbar', { name: 'Formatação: Corpo do texto' });
    const linkButton = toolbar.getByRole('button', { name: 'Link', exact: true });
    const address = rich.getByRole('textbox', { name: 'Endereço do link' });
    // Fechado, o popover nativo sai da árvore de acessibilidade: o estado vem do próprio popover.
    const popoverOpen = () =>
      rich.element().querySelector('[popover]')?.matches(':popover-open') ?? false;
    const selection = () => {
      const { state } = (editor.element() as HTMLElement & { editor: Editor }).editor;
      return state.doc.textBetween(state.selection.from, state.selection.to);
    };

    // Seleciona a palavra "link" pelo teclado e abre o popover pelo botão da barra. O link fica
    // dentro da frase (alvo em linha, exceção do 2.5.8).
    await expect.element(editor).toHaveTextContent('Texto de exemplo para o link.');
    // O ProseMirror lê a seleção do DOM no `selectionchange`, e uma tecla que chega antes dele
    // se perde: repete o gesto até o estado do editor ser a palavra.
    for (let attempt = 0; attempt < 10 && selection() !== 'link'; attempt += 1) {
      (editor.element() as HTMLElement).focus();
      // Fim do texto sem o End (no macOS ele só rola): seleciona tudo e recolhe para a direita.
      await userEvent.keyboard('{ControlOrMeta>}a{/ControlOrMeta}{ArrowRight}{ArrowLeft}');
      await userEvent.keyboard('{Shift>}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{/Shift}');
      await expect
        .poll(selection, { timeout: 1000 })
        .toBe('link')
        .catch(() => undefined);
    }
    expect(selection()).toBe('link');
    (linkButton.element() as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await expect.element(address).toBeVisible();
    await expect.element(address).toHaveFocus();
    await expect.element(address).toHaveValue('');

    // Endereço inválido: o erro fica no campo do popover, que continua aberto.
    await userEvent.keyboard('exemplo{Enter}');
    await expect.element(address).toHaveAttribute('aria-invalid', 'true');
    await expect.element(address).toBeVisible();
    expect(await audit(rich)).toEqual([]);

    await userEvent.keyboard('{ControlOrMeta>}a{/ControlOrMeta}https://exemplo.com/guia{Enter}');
    await expect.poll(popoverOpen).toBe(false);
    await expect.element(editor).toHaveFocus();
    await expect
      .element(editor.getByRole('link', { name: 'link', exact: true }))
      .toHaveAttribute('href', 'https://exemplo.com/guia');
    await expect.element(linkButton).toHaveAttribute('aria-pressed', 'true');

    // Com o cursor no link, o popover reabre com o endereço e "Remover link"; Esc fecha e
    // devolve o foco ao editor.
    (linkButton.element() as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await expect.element(address).toHaveValue('https://exemplo.com/guia');
    await expect.element(rich.getByRole('button', { name: 'Remover link' })).toBeVisible();
    expect(await audit(rich)).toEqual([]);
    await userEvent.keyboard('{Escape}');
    await expect.poll(popoverOpen).toBe(false);
    await expect.element(editor).toHaveFocus();

    (rich.getByRole('button', { name: 'Salvar texto' }).element() as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await expect.poll(toastText).toContain('Texto salvo.');
  });
});
