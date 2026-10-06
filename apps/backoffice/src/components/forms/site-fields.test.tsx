// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';

import { SchemaForm } from './schema-form.tsx';
import { choiceField, flagsField, linesField } from './site-fields.tsx';

// Campos da configuração do site no gerador (#47): linhas ↔ lista, flags ↔ registro e
// escolha entre as opções recebidas.

afterEach(cleanup);

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

    const domains = screen.getByLabelText<HTMLTextAreaElement>('Domínios');
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

    await user.clear(screen.getByLabelText('Domínios'));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Domínios').getAttribute('aria-invalid')).toBe('true'),
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
    within(group).getByRole('button', { name: 'Remover recurso 1' }).focus();
    await user.keyboard('{Enter}');
    within(group).getByRole('button', { name: 'Adicionar recurso' }).focus();
    await user.keyboard('{Enter}');
    await user.type(within(group).getByLabelText('Nome do recurso 2'), 'busca');
    const [comentarios] = within(group).getAllByRole('checkbox');
    comentarios?.focus();
    await user.keyboard(' ');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect((await submitted(onSubmit)).featureFlags).toEqual({ comentarios: true, busca: true });
  });

  it('escolha: só as opções recebidas, com o valor atual selecionado', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm({ domains: ['a.example.com'], featureFlags: {}, preset: 'padrao' });

    const preset = screen.getByLabelText<HTMLSelectElement>('Preset');
    expect(
      within(preset)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['padrao', 'revista']);
    await user.selectOptions(preset, 'revista');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect((await submitted(onSubmit)).preset).toBe('revista');
  });
});
