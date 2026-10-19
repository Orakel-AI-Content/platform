// @vitest-environment happy-dom
import { TextBlockSchema } from '@orakel/content-model/v1';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import Modal from 'react-modal';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_ELEMENT_ID } from '@/components/ui/utils/modalApp';

import { richTextField } from './RichTextField.tsx';
import { SchemaForm } from './SchemaForm.tsx';

// Popover de link (#132) com o editor TipTap real. O happy-dom não implementa a Popover API:
// abrir é o evento `toggle`, e `hidePopover` é espionado (o E2E confere o navegador).

// "Remover link" confirma num diálogo (#327), que esconde o contêiner da app.
let app: HTMLElement;
beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
beforeEach(() => {
  app = document.createElement('div');
  app.id = APP_ELEMENT_ID;
  document.body.append(app);
  Modal.setAppElement(app);
});
afterEach(() => {
  cleanup();
  app.remove();
});

/** Confirma no diálogo de "Remover link". */
async function confirmRemove(user: ReturnType<typeof userEvent.setup>) {
  const dialog = await screen.findByRole('alertdialog', { name: 'Remover o link?' });
  await user.click(within(dialog).getByRole('button', { name: 'Remover' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
}

const paragraph = (children: unknown[]) => ({ type: 'paragraph', children });

function renderEditor(content: unknown[]) {
  const onSubmit = vi.fn();
  render(
    <SchemaForm
      schema={TextBlockSchema}
      defaultValues={{ n: 1, type: 'text', content }}
      labels={{ content: 'Texto' }}
      hidden={['n', 'type']}
      fields={{ content: richTextField('richText') }}
      submitLabel="Salvar"
      onSubmit={onSubmit}
    />,
  );
  return onSubmit;
}

/** Botão Link, o popover dele e um `hidePopover` que dispara o `toggle` de fechamento. */
function linkPopover() {
  const button = screen.getByRole('button', { name: 'Link' });
  const popover = document.getElementById(button.getAttribute('popovertarget') ?? '');
  if (popover === null) throw new Error('Link sem popover');
  const hide = vi.fn(() => toggle(popover, 'closed'));
  popover.hidePopover = hide;
  return { button, popover, hide };
}

function toggle(popover: HTMLElement, newState: 'open' | 'closed') {
  popover.dispatchEvent(Object.assign(new Event('toggle'), { newState }));
}

describe('popover de link', () => {
  it('o botão Link abre um campo rotulado, sem window.prompt', async () => {
    const prompt = vi.fn();
    window.prompt = prompt;
    renderEditor([paragraph([{ type: 'text', text: 'Guia' }])]);
    await screen.findByRole('textbox', { name: 'Texto' });

    const { button, popover } = linkPopover();
    expect(popover.getAttribute('popover')).toBe('auto');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    toggle(popover, 'open');

    const input = within(popover).getByLabelText('Endereço do link');
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(prompt).not.toHaveBeenCalled();
  });

  it('endereço inválido mostra o erro ligado ao campo e não aplica nem envia o formulário', async () => {
    const user = userEvent.setup();
    const onSubmit = renderEditor([paragraph([{ type: 'text', text: 'Guia' }])]);
    const editor = await screen.findByRole('textbox', { name: 'Texto' });
    await user.click(editor);
    await user.keyboard('{Control>}a{/Control}');
    const { popover, hide } = linkPopover();
    toggle(popover, 'open');
    const input = within(popover).getByLabelText('Endereço do link');

    await user.type(input, 'javascript:alert(1){Enter}');

    expect(input.getAttribute('aria-invalid')).toBe('true');
    const error = within(popover).getByText('Use um caminho iniciado por / ou uma URL http(s)');
    expect(input.getAttribute('aria-describedby')?.split(' ')).toContain(error.id);
    expect(hide).not.toHaveBeenCalled();
    expect(editor.querySelector('a')).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Enter aplica sobre a seleção, fecha e devolve o foco ao editor', async () => {
    const user = userEvent.setup();
    const onSubmit = renderEditor([paragraph([{ type: 'text', text: 'Guia' }])]);
    const editor = await screen.findByRole('textbox', { name: 'Texto' });
    await user.click(editor);
    await user.keyboard('{Control>}a{/Control}');
    const { popover, hide } = linkPopover();
    toggle(popover, 'open');

    await user.type(within(popover).getByLabelText('Endereço do link'), '/guia/{Enter}');

    expect(hide).toHaveBeenCalled();
    await waitFor(() => expect(editor.querySelector('a')?.getAttribute('href')).toBe('/guia/'));
    expect(editor.contains(document.activeElement)).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      content: [
        paragraph([{ type: 'link', href: '/guia/', children: [{ type: 'text', text: 'Guia' }] }]),
      ],
    });
  });

  it('num link existente abre preenchido; altera o endereço e remove o link', async () => {
    const user = userEvent.setup();
    renderEditor([
      paragraph([{ type: 'link', href: '/antigo/', children: [{ type: 'text', text: 'Guia' }] }]),
    ]);
    const editor = await screen.findByRole('textbox', { name: 'Texto' });
    await user.click(editor);
    await user.keyboard('{Control>}a{/Control}');
    const { button, popover } = linkPopover();
    await waitFor(() => expect(button.getAttribute('aria-pressed')).toBe('true'));

    toggle(popover, 'open');
    const input = within(popover).getByLabelText<HTMLInputElement>('Endereço do link');
    await waitFor(() => expect(input.value).toBe('/antigo/'));
    await user.clear(input);
    await user.type(input, 'https://example.com/novo{Enter}');
    await waitFor(() =>
      expect(editor.querySelector('a')?.getAttribute('href')).toBe('https://example.com/novo'),
    );

    toggle(popover, 'open');
    await user.click(within(popover).getByRole('button', { name: 'Remover link' }));
    await confirmRemove(user);
    await waitFor(() => expect(editor.querySelector('a')).toBeNull());
    expect(editor.textContent).toBe('Guia');
    expect(editor.contains(document.activeElement)).toBe(true);
  });

  it('Remover link fecha o popover e confirma; Esc e Cancelar mantêm o link e voltam ao botão Link', async () => {
    const user = userEvent.setup();
    renderEditor([
      paragraph([{ type: 'link', href: '/guia/', children: [{ type: 'text', text: 'Guia' }] }]),
    ]);
    const editor = await screen.findByRole('textbox', { name: 'Texto' });
    await user.click(editor);
    await user.keyboard('{Control>}a{/Control}');
    const { button, popover, hide } = linkPopover();
    await waitFor(() => expect(button.getAttribute('aria-pressed')).toBe('true'));

    for (const dismiss of ['Esc', 'Cancelar'] as const) {
      toggle(popover, 'open');
      const removeLink = await within(popover).findByRole('button', { name: 'Remover link' });
      expect(removeLink.className).toContain('text-error');
      hide.mockClear();
      await user.click(removeLink);
      expect(hide).toHaveBeenCalled();
      const dialog = await screen.findByRole('alertdialog', { name: 'Remover o link?' });
      expect(within(dialog).getByRole('button', { name: 'Remover' }).className).toContain(
        'bg-error',
      );
      if (dismiss === 'Esc') await user.keyboard('{Escape}');
      else await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(button));
      expect(editor.querySelector('a')?.getAttribute('href')).toBe('/guia/');
    }
  });

  it('clicar em Aplicar e em Remover link mexe só no link, sem enviar o formulário (#303)', async () => {
    const user = userEvent.setup();
    const onSubmit = renderEditor([paragraph([{ type: 'text', text: 'Guia' }])]);
    const editor = await screen.findByRole('textbox', { name: 'Texto' });
    await user.click(editor);
    await user.keyboard('{Control>}a{/Control}');
    const { button, popover, hide } = linkPopover();
    toggle(popover, 'open');

    await user.type(within(popover).getByLabelText('Endereço do link'), '/sobre/');
    await user.click(within(popover).getByRole('button', { name: 'Aplicar' }));

    expect(hide).toHaveBeenCalled();
    await waitFor(() => expect(editor.querySelector('a')?.getAttribute('href')).toBe('/sobre/'));
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(editor);
    await user.keyboard('{Control>}a{/Control}');
    await waitFor(() => expect(button.getAttribute('aria-pressed')).toBe('true'));
    toggle(popover, 'open');
    await user.click(await within(popover).findByRole('button', { name: 'Remover link' }));
    await confirmRemove(user);

    await waitFor(() => expect(editor.querySelector('a')).toBeNull());
    expect(editor.textContent).toBe('Guia');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('sem seleção, aplicar insere o endereço como texto do link', async () => {
    const user = userEvent.setup();
    renderEditor([paragraph([{ type: 'text', text: 'Veja ' }])]);
    const editor = await screen.findByRole('textbox', { name: 'Texto' });
    await user.click(editor);
    const { popover } = linkPopover();
    toggle(popover, 'open');
    expect(within(popover).queryByRole('button', { name: 'Remover link' })).toBeNull();

    await user.type(within(popover).getByLabelText('Endereço do link'), '/contato/{Enter}');

    await waitFor(() => expect(editor.querySelector('a')?.textContent).toBe('/contato/'));
  });
});
