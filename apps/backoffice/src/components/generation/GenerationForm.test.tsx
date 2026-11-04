// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { EntityFormResult } from '@/components/editorial/EntityForms';
import { toast } from '@/components/ui/toast';
import { fieldLabel } from '@/test/fieldLabel.ts';

import { GenerationForm, type CurrentContext } from './GenerationForm.tsx';

// Disparo da geração: tema e autor vão para a ação; a versão vigente do contexto aparece só
// para leitura; sem contexto (ou sem autores), o aviso no lugar do formulário; a recusa do
// domínio volta no campo.

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});
afterEach(async () => {
  act(() => toast.removeAll());
  await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
  cleanup();
  vi.clearAllMocks();
});

const AUTHORS = [
  { id: 3, label: 'Ana Souza' },
  { id: 5, label: 'Bruno Lima' },
];

const ok = () =>
  vi.fn(() => Promise.resolve<EntityFormResult>({ ok: true, message: 'Enfileirada.' }));

function renderForm(
  action: (value: unknown) => Promise<EntityFormResult>,
  options: { context?: CurrentContext; authors?: typeof AUTHORS } = {},
) {
  // `context: undefined` é o site sem contexto: o padrão só vale sem a chave.
  const context = 'context' in options ? options.context : { version: 4 };
  render(
    <GenerationForm
      siteId="exemplo-a"
      authors={options.authors ?? AUTHORS}
      context={context}
      action={action}
    />,
  );
}

const topic = () => screen.getByLabelText(fieldLabel('Tema ou palavra-chave'));
const submit = () => screen.getByRole('button', { name: 'Gerar artigo' });

describe('formulário da geração', () => {
  it('mostra a versão vigente e envia tema e autor; depois volta ao vazio', async () => {
    const user = userEvent.setup();
    const action = ok();
    renderForm(action);

    expect(screen.getByText('v4')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Contextos editoriais' }).getAttribute('href')).toBe(
      '/sites/exemplo-a/contextos',
    );
    await user.type(topic(), 'Café coado');
    await user.click(screen.getByRole('combobox', { name: fieldLabel('Autor') }));
    await user.click(await screen.findByText('Bruno Lima'));
    await user.click(submit());

    await waitFor(() => expect(action).toHaveBeenCalledWith({ topic: 'Café coado', authorId: 5 }));
    await waitFor(() => expect((topic() as HTMLInputElement).value).toBe(''));
  });

  it('com um autor só, ele já vem escolhido', async () => {
    const user = userEvent.setup();
    const action = ok();
    renderForm(action, { authors: [AUTHORS[0]!] });

    await user.type(topic(), 'Chá');
    await user.click(submit());

    await waitFor(() => expect(action).toHaveBeenCalledWith({ topic: 'Chá', authorId: 3 }));
  });

  it('tema vazio e autor sem escolha são recusados nos campos, sem chamar a ação', async () => {
    const user = userEvent.setup();
    const action = ok();
    renderForm(action);

    await user.click(submit());

    await waitFor(() => expect(topic().getAttribute('aria-invalid')).toBe('true'));
    expect(screen.getAllByText('Escolha o autor').length).toBeGreaterThan(0);
    expect(action).not.toHaveBeenCalled();
  });

  it('a recusa do domínio volta no campo', async () => {
    const user = userEvent.setup();
    const action = vi.fn(() =>
      Promise.resolve<EntityFormResult>({
        ok: false,
        message: 'Não foi possível disparar a geração.',
        issues: [{ path: ['topic'], message: 'Escreva o tema do artigo' }],
      }),
    );
    renderForm(action, { authors: [AUTHORS[0]!] });

    await user.type(topic(), 'x');
    await user.click(submit());

    await waitFor(() => expect(topic().getAttribute('aria-invalid')).toBe('true'));
    expect(screen.getAllByText('Escreva o tema do artigo').length).toBeGreaterThan(0);
  });

  it('sem contexto editorial, o aviso com o link e nenhum formulário', () => {
    renderForm(ok(), { context: undefined });

    expect(document.body.textContent).toContain(
      'Cadastre o contexto editorial do site antes de gerar',
    );
    expect(screen.getByRole('link', { name: 'Contextos editoriais' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Gerar artigo' })).toBeNull();
  });

  it('sem autores no site, o aviso com o link para Autores', () => {
    renderForm(ok(), { authors: [] });

    expect(screen.getByRole('link', { name: 'Autores' }).getAttribute('href')).toBe(
      '/sites/exemplo-a/autores',
    );
    expect(screen.queryByRole('button', { name: 'Gerar artigo' })).toBeNull();
  });
});
