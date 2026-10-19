// @vitest-environment happy-dom
import { InlinesSchema, QuoteBlockSchema, TextBlockSchema } from '@orakel/content-model/v1';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { richTextField } from './RichTextField.tsx';
import { SchemaForm } from './SchemaForm.tsx';

// Campo de rich text no gerador (#43): nome acessível, barra, teclado e valor válido. Barra
// com ícones em dois grupos, separados (#133).

afterEach(cleanup);

// Botões da barra, sem os do popover de link (#132): no navegador o popover fechado não
// aparece nem conta na árvore de acessibilidade; o happy-dom não implementa popover.
const toolbarButtons = (toolbar: HTMLElement) =>
  within(toolbar)
    .getAllByRole('button')
    .filter((button) => button.closest('[popover]') === null);

const textBlock = {
  n: 1,
  type: 'text',
  content: [{ type: 'paragraph', children: [{ type: 'text', text: 'Olá mundo' }] }],
};

function renderText(onSubmit = vi.fn()) {
  render(
    <SchemaForm
      schema={TextBlockSchema}
      defaultValues={textBlock}
      labels={{ content: 'Texto' }}
      hidden={['n', 'type']}
      fields={{ content: richTextField('richText') }}
      submitLabel="Salvar"
      onSubmit={onSubmit}
    />,
  );
  return onSubmit;
}

describe('campo de rich text', () => {
  it('tem nome acessível e a barra só com as formatações do schema', async () => {
    renderText();

    const editor = await screen.findByRole('textbox', { name: 'Texto' });
    expect(editor.getAttribute('aria-multiline')).toBe('true');
    expect(editor.textContent).toBe('Olá mundo');
    const toolbar = screen.getByRole('toolbar', { name: 'Formatação: Texto' });
    // Pelo nome acessível: com o botão de ícone, o texto dentro dele é só a dica.
    const buttons = toolbarButtons(toolbar);
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Negrito',
      'Itálico',
      'Código',
      'Link',
      'Intertítulo 2',
      'Intertítulo 3',
      'Lista',
      'Lista numerada',
    ]);
    // Botões de ícone, todos com o estado em aria-pressed e o ícone fora da leitura.
    for (const button of buttons) {
      expect(button.querySelector('svg')).toBeTruthy();
      expect(button.getAttribute('aria-pressed')).toBe('false');
    }
    // Marcas | estrutura: um separador entre "Link" e "Intertítulo 2".
    const separator = within(toolbar).getByRole('separator');
    expect(separator.getAttribute('aria-orientation')).toBe('vertical');
    const order = [...toolbar.querySelectorAll('button, [role="separator"]')]
      .filter((node) => node.closest('[popover]') === null)
      .map((node) => node.getAttribute('aria-label') ?? '|');
    expect(order.slice(3, 6)).toEqual(['Link', '|', 'Intertítulo 2']);
  });

  it('atalho de negrito marca o texto, e o valor enviado passa no TextBlockSchema', async () => {
    const user = userEvent.setup();
    const onSubmit = renderText();

    const editor = await screen.findByRole('textbox', { name: 'Texto' });
    await user.click(editor);
    await user.keyboard('{Control>}a{/Control}{Control>}b{/Control}');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Negrito' }).getAttribute('aria-pressed')).toBe(
        'true',
      ),
    );

    screen.getByRole('button', { name: 'Salvar' }).focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const value = onSubmit.mock.calls[0]?.[0] as unknown;
    expect(TextBlockSchema.safeParse(value).success).toBe(true);
    expect(value).toMatchObject({
      content: [
        { type: 'paragraph', children: [{ type: 'text', text: 'Olá mundo', marks: ['bold'] }] },
      ],
    });
  });

  it('modo inlines: sem intertítulo nem lista, valor no InlinesSchema', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <SchemaForm
        schema={QuoteBlockSchema}
        defaultValues={{ n: 1, type: 'quote', content: [{ type: 'text', text: 'Frase' }] }}
        labels={{ content: 'Citação' }}
        hidden={['n', 'type']}
        fields={{ content: richTextField('inlines') }}
        submitLabel="Salvar"
        onSubmit={onSubmit}
      />,
    );

    const editor = await screen.findByRole('textbox', { name: 'Citação' });
    expect(editor.getAttribute('aria-multiline')).toBe('false');
    const toolbar = screen.getByRole('toolbar', { name: 'Formatação: Citação' });
    expect(within(toolbar).queryByRole('button', { name: /Intertítulo|Lista/ })).toBeNull();
    // Só as marcas, sem separador (#133).
    expect(toolbarButtons(toolbar)).toHaveLength(4);
    expect(within(toolbar).queryByRole('separator')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const value = onSubmit.mock.calls[0]?.[0] as { content: unknown };
    expect(InlinesSchema.safeParse(value.content).success).toBe(true);
    expect(value.content).toEqual([{ type: 'text', text: 'Frase' }]);
  });
});
