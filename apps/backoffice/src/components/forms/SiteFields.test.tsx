// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import Modal from 'react-modal';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';

import { APP_ELEMENT_ID } from '@/components/ui/utils/modalApp';

import { SchemaForm, type SchemaFormIssue } from './SchemaForm.tsx';
import { choiceField, flagsField, linesField, switchField, themeField } from './SiteFields.tsx';
import { fieldLabel } from '@/test/fieldLabel.ts';

// Campos da configuração do site no gerador (#47): linhas ↔ lista, flags ↔ registro,
// escolha entre as opções recebidas e liga/desliga.

// A mensagem de erro do FormItem (#245) anima com o motion, que o happy-dom cancela no `cleanup`.
beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

// Remover recurso confirma num diálogo (#327), que esconde o contêiner da app.
let app: HTMLElement;
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

const schema = z.object({
  domains: z.array(z.string().min(1)).min(1),
  featureFlags: z.record(z.string().regex(/^[a-z][a-zA-Z0-9]*$/), z.boolean()),
  preset: z.string(),
});

function renderForm(defaultValues: Record<string, unknown>, onSubmit = vi.fn()) {
  render(
    <SchemaForm
      schema={schema}
      defaultValues={defaultValues}
      labels={{ domains: 'Domínios', featureFlags: 'Recursos ligados', preset: 'Preset' }}
      fields={{
        domains: linesField(),
        featureFlags: flagsField(),
        preset: choiceField(['padrao', 'revista']),
      }}
      submitLabel="Salvar"
      onSubmit={onSubmit}
    />,
  );
  return onSubmit;
}

const submitted = async (onSubmit: ReturnType<typeof vi.fn>) => {
  await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  return onSubmit.mock.calls[0]?.[0] as z.infer<typeof schema>;
};

describe('campos da configuração do site', () => {
  it('linhas: o texto digitado fica no campo e o valor é a lista sem linhas em branco', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({ domains: ['a.example.com'], featureFlags: {}, preset: 'padrao' });

    const domains = screen.getByLabelText<HTMLTextAreaElement>(fieldLabel('Domínios'));
    expect(domains.value).toBe('a.example.com');
    await user.type(domains, '{Enter}');
    expect(domains.value).toBe('a.example.com\n');
    await user.type(domains, '{Enter}b.example.com');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect((await submitted(onSubmit)).domains).toEqual(['a.example.com', 'b.example.com']);
  });

  it('linhas: vazio é recusado pelo schema (ao menos um domínio)', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({ domains: ['a.example.com'], featureFlags: {}, preset: 'padrao' });

    await user.clear(screen.getByLabelText(fieldLabel('Domínios')));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(screen.getByLabelText(fieldLabel('Domínios')).getAttribute('aria-invalid')).toBe(
        'true',
      ),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('flags: adiciona, liga e remove pelo teclado; envia o registro', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({
      domains: ['a.example.com'],
      featureFlags: { newsletter: true, comentarios: false },
      preset: 'padrao',
    });

    const group = screen.getByRole('group', { name: 'Recursos ligados' });
    const removeFirst = within(group).getByRole('button', { name: 'Remover recurso 1' });
    expect(removeFirst.className).toContain('text-error');
    removeFirst.focus();
    // Cancelar não remove e devolve o foco ao botão; "Remover" do diálogo remove.
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(document.activeElement).toBe(removeFirst);
    expect(within(group).getByLabelText(fieldLabel('Nome do recurso 2'))).toBeTruthy();
    await user.keyboard('{Enter}');
    const dialog = screen.getByRole('alertdialog', { name: 'Remover recurso 1?' });
    await user.click(within(dialog).getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    within(group).getByRole('button', { name: 'Adicionar recurso' }).focus();
    await user.keyboard('{Enter}');
    await user.type(within(group).getByLabelText(fieldLabel('Nome do recurso 2')), 'busca');
    // Liga/desliga no Switcher do Ecme (#331), com nome por linha.
    const comentarios = within(group).getByRole('switch', { name: 'Recurso 1 ligado' });
    expect(comentarios).toHaveProperty('checked', false);
    expect(within(group).queryByRole('checkbox')).toBeNull();
    comentarios.focus();
    await user.keyboard(' ');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect((await submitted(onSubmit)).featureFlags).toEqual({ comentarios: true, busca: true });
  });

  it('escolha: só as opções recebidas, com o valor atual selecionado', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({ domains: ['a.example.com'], featureFlags: {}, preset: 'padrao' });

    const preset = screen.getByRole('combobox', { name: fieldLabel('Preset') });
    expect(screen.getByText('padrao')).toBeTruthy();
    preset.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'padrao',
      'revista',
    ]);
    await user.keyboard('{ArrowDown}{Enter}');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect((await submitted(onSubmit)).preset).toBe('revista');
  });

  it('obrigatório (#329): linhas e escolha com aria-required; recursos (grupo) só o asterisco', () => {
    renderForm({ domains: ['a.example.com'], featureFlags: {}, preset: 'padrao' });

    expect(screen.getByLabelText(fieldLabel('Domínios')).getAttribute('aria-required')).toBe(
      'true',
    );
    expect(screen.getByLabelText(fieldLabel('Preset')).getAttribute('aria-required')).toBe('true');
    expect(screen.getByText('Recursos ligados').closest('label')?.textContent).toBe(
      '*Recursos ligados',
    );
  });
});

describe('tema (#163)', () => {
  const themes = [
    {
      id: 'exemplo-a',
      name: 'Editorial claro',
      colors: { background: '#ffffff', text: '#1c1a17', accent: '#a61b1b' },
    },
    {
      id: 'exemplo-b',
      name: 'Tecnológico escuro',
      colors: { background: '#0e1116', text: '#eef1f5', accent: '#ffb224' },
    },
  ] as const;

  function renderTheme(
    theme: string,
    onSubmit: (value: unknown) => void | SchemaFormIssue[] = vi.fn(),
  ) {
    render(
      <SchemaForm
        schema={z.object({ theme: z.string() })}
        defaultValues={{ theme }}
        labels={{ theme: 'Tema' }}
        fields={{ theme: themeField(themes) }}
        submitLabel="Salvar"
        onSubmit={onSubmit}
      />,
    );
  }

  it('um rádio por tema, com nome legível e amostra das cores; sem texto livre', () => {
    renderTheme('exemplo-a');

    const group = screen.getByRole('radiogroup', { name: 'Tema' });
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(within(group).getByRole('radio', { name: /Editorial claro/ })).toHaveProperty(
      'checked',
      true,
    );
    expect(within(group).getByRole('radio', { name: /Tecnológico escuro/ })).toHaveProperty(
      'checked',
      false,
    );
    expect(screen.queryByRole('textbox')).toBeNull();
    for (const theme of themes) {
      const option = within(group).getByRole('radio', { name: new RegExp(theme.name) });
      const swatches = [
        ...(option.closest('label')?.querySelectorAll('[data-swatch]') ?? []),
      ] as HTMLElement[];
      expect(swatches.map((swatch) => swatch.dataset.swatch)).toEqual([
        theme.colors.background,
        theme.colors.text,
        theme.colors.accent,
      ]);
      expect(swatches[0]?.parentElement?.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('escolher pelo teclado envia o id do tema', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderTheme('exemplo-a', onSubmit);

    screen.getByRole('radio', { name: /Editorial claro/ }).focus();
    await user.keyboard('{ArrowDown}');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await submitted(onSubmit);
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ theme: 'exemplo-b' });
  });

  it('a recusa do servidor no tema leva o foco ao rádio marcado', async () => {
    const user = userEvent.setup();
    renderTheme('exemplo-b', () => [{ path: ['theme'], message: 'Tema "x" não existe' }]);

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('radio', { name: /Tecnológico escuro/ }),
      ),
    );
    expect(screen.getByRole('radiogroup').getAttribute('aria-invalid')).toBe('true');
  });
});

describe('liga/desliga (#331)', () => {
  function renderSwitch(
    indexavel: boolean,
    onSubmit: (value: unknown) => void | SchemaFormIssue[] = vi.fn(),
  ) {
    render(
      <SchemaForm
        schema={z.object({ indexavel: z.boolean() })}
        defaultValues={{ indexavel }}
        labels={{ indexavel: 'Indexável' }}
        hints={{ indexavel: 'Ligar exige o G1 registrado.' }}
        fields={{ indexavel: switchField() }}
        submitLabel="Salvar"
        onSubmit={onSubmit}
      />,
    );
  }

  it('Switcher com o rótulo e a dica do FormItem, sem asterisco; envia o booleano', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderSwitch(false, onSubmit);

    const indexavel = screen.getByRole('switch', { name: 'Indexável' });
    expect(indexavel).toHaveProperty('checked', false);
    expect(indexavel.getAttribute('aria-required')).toBeNull();
    expect(screen.getByText('Indexável').closest('label')?.textContent).toBe('Indexável');
    const hint = document.getElementById(indexavel.getAttribute('aria-describedby') ?? '');
    expect(hint?.textContent).toBe('Ligar exige o G1 registrado.');
    indexavel.focus();
    await user.keyboard(' ');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await submitted(onSubmit);
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ indexavel: true });
  });

  it('a recusa do servidor leva o foco ao Switcher', async () => {
    const user = userEvent.setup();
    renderSwitch(true, () => [{ path: ['indexavel'], message: 'Exige o G1 registrado' }]);

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('switch', { name: 'Indexável' })),
    );
  });
});
