// @vitest-environment happy-dom
import {
  AuthorSchema,
  FaqBlockSchema,
  ImageBlockSchema,
  InstitutionalTextsSchema,
  QuoteBlockSchema,
} from '@orakel/content-model/v1';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm, type FieldValues } from 'react-hook-form';
import { MotionGlobalConfig } from 'motion/react';
import Modal from 'react-modal';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';

import { toast, ToastProvider } from '@/components/ui/toast';
import { APP_ELEMENT_ID } from '@/components/ui/utils/modalApp';

import { SchemaFields, SchemaForm, type FieldProps } from './SchemaForm.tsx';
import { fieldLabel } from '@/test/fieldLabel.ts';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

// Gerador de formulários (#42): campos por tipo, listas, registro, erros e teclado.

// A mensagem de erro do FormItem (#245) anima com o motion, que o happy-dom cancela no `cleanup`.
beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

// Remover item confirma num diálogo (#327), que esconde o contêiner da app.
let app: HTMLElement;
beforeEach(() => {
  app = document.createElement('div');
  app.id = APP_ELEMENT_ID;
  document.body.append(app);
  Modal.setAppElement(app);
});

afterEach(async () => {
  act(() => toast.removeAll());
  await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
  cleanup();
  app.remove();
});

/** Campo de rich text simplificado (o de verdade, com TipTap, é da #43). */
function PlainInlines({ id, label, value, onChange, invalid, describedBy, ref }: FieldProps) {
  const text = Array.isArray(value)
    ? value.map((inline: { text?: string }) => inline.text ?? '').join('')
    : '';
  return (
    <textarea
      id={id}
      ref={ref}
      aria-label={label}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      value={text}
      onChange={(event) =>
        onChange(event.target.value === '' ? [] : [{ type: 'text', text: event.target.value }])
      }
    />
  );
}

const inline = (text: string) => [{ type: 'text', text }];

describe('SchemaForm', () => {
  it('quote: desenha os campos, sem n nem type, e o rich text pelo registro', () => {
    render(
      <SchemaForm
        schema={QuoteBlockSchema}
        defaultValues={{ n: 1, type: 'quote', content: inline('Frase') }}
        labels={{ content: 'Citação', attribution: 'Autoria', sourceUrl: 'Fonte' }}
        hidden={['n', 'type']}
        fields={{ content: PlainInlines }}
        submitLabel="Salvar"
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(fieldLabel('Citação'))).toHaveProperty('value', 'Frase');
    expect(screen.getByLabelText(fieldLabel('Autoria'))).toBeTruthy();
    expect(screen.getByLabelText(fieldLabel('Fonte'))).toBeTruthy();
    expect(screen.queryByLabelText(fieldLabel('n'))).toBeNull();
    expect(screen.queryByLabelText(fieldLabel('type'))).toBeNull();
    expect(screen.queryByText(/sem editor/)).toBeNull();
  });

  it('faq: lista de perguntas com adicionar e remover, só pelo teclado', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <SchemaForm
        schema={FaqBlockSchema}
        defaultValues={{ n: 3, type: 'faq', items: [{ question: 'P1', answer: inline('R1') }] }}
        labels={{
          items: 'Perguntas',
          'items.*': 'pergunta',
          'items.*.question': 'Pergunta',
          'items.*.answer': 'Resposta',
        }}
        hidden={['n', 'type']}
        fields={{ 'items.*.answer': PlainInlines }}
        submitLabel="Salvar"
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getAllByLabelText(fieldLabel('Pergunta'))).toHaveLength(1);
    const add = screen.getByRole('button', { name: 'Adicionar pergunta' });
    add.focus();
    await user.keyboard('{Enter}');
    expect(screen.getAllByLabelText(fieldLabel('Pergunta'))).toHaveLength(2);

    // Preenche a nova pergunta só com Tab e digitação.
    await user.click(screen.getAllByLabelText(fieldLabel('Pergunta'))[0] as HTMLElement);
    await user.tab();
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(screen.getAllByLabelText(fieldLabel('Pergunta'))[1]);
    await user.keyboard('P2');
    await user.tab();
    await user.keyboard('R2');

    // Remover confirma num diálogo: Esc e Cancelar não removem e devolvem o foco ao botão.
    const removeFirst = screen.getByRole('button', { name: 'Remover pergunta 1' });
    expect(removeFirst.className).toContain('text-error');
    removeFirst.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('alertdialog', { name: 'Remover pergunta 1?' })).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(document.activeElement).toBe(removeFirst);
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(document.activeElement).toBe(removeFirst);
    expect(screen.getAllByLabelText(fieldLabel('Pergunta'))).toHaveLength(2);

    await user.keyboard('{Enter}');
    const confirm = within(screen.getByRole('alertdialog')).getByRole('button', {
      name: 'Remover',
    });
    expect(confirm.className).toContain('bg-error');
    await user.click(confirm);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getAllByLabelText(fieldLabel('Pergunta'))).toHaveLength(1);

    screen.getByRole('button', { name: 'Salvar' }).focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      n: 3,
      type: 'faq',
      items: [{ question: 'P2', answer: inline('R2') }],
    });
  });

  it('autor: todos os campos, e obrigatório vazio mostra o erro junto do campo', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <SchemaForm
        schema={AuthorSchema}
        defaultValues={{ id: 1, slug: 'ana', name: '' }}
        hidden={['id']}
        submitLabel="Salvar"
        onSubmit={onSubmit}
      />,
    );

    for (const label of ['slug', 'name', 'bio', 'expertise', 'avatarMediaId']) {
      expect(screen.getByLabelText(fieldLabel(label))).toBeTruthy();
    }
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    const name = screen.getByLabelText(fieldLabel('name'));
    await waitFor(() => expect(name.getAttribute('aria-invalid')).toBe('true'));
    const describedBy = name.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(describedBy)?.textContent).toMatch(/\S/);
    // Sem rótulo em `labels`, o resumo usa o nome do campo, com a mesma mensagem do campo.
    const item = within(screen.getByRole('alert')).getByRole('button');
    expect(item.textContent).toBe(`name: ${document.getElementById(describedBy)?.textContent}`);
    await user.click(item);
    expect(document.activeElement).toBe(name);
    expect(onSubmit).not.toHaveBeenCalled();
    // Opcionais vazios não acusam erro.
    expect(screen.getByLabelText(fieldLabel('bio')).getAttribute('aria-invalid')).toBe('false');
  });

  it('imagem: a regra cruzada (alt ou decorativa) aparece no campo alt', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <SchemaForm
        schema={ImageBlockSchema}
        defaultValues={{ n: 2, type: 'image', mediaId: 1, alt: '', decorative: false }}
        hidden={['n', 'type']}
        fields={{ caption: PlainInlines }}
        submitLabel="Salvar"
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    const alt = screen.getByLabelText(fieldLabel('alt'));
    await waitFor(() => expect(alt.getAttribute('aria-invalid')).toBe('true'));
    expect(document.getElementById(alt.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Informe o texto alternativo ou marque a imagem como decorativa',
    );

    // Marcar decorativa resolve.
    await user.click(screen.getByLabelText(fieldLabel('decorative')));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ n: 2, type: 'image', mediaId: 1, decorative: true }),
    );
  });

  it('campo registrado substitui o padrão no caminho indicado', () => {
    function Seletor({ id, label }: FieldProps) {
      return (
        <select id={id} aria-label={`${label} (seletor)`}>
          <option>Mídia 1</option>
        </select>
      );
    }
    render(
      <SchemaForm
        schema={ImageBlockSchema}
        defaultValues={{ n: 2, type: 'image', mediaId: 1, decorative: true }}
        labels={{ mediaId: 'Mídia' }}
        hidden={['n', 'type']}
        fields={{ mediaId: Seletor, caption: PlainInlines }}
        submitLabel="Salvar"
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(fieldLabel('Mídia (seletor)')).tagName).toBe('SELECT');
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });

  it('nó sem desenho padrão e sem campo registrado mostra um aviso', () => {
    render(
      <SchemaForm
        schema={QuoteBlockSchema}
        defaultValues={{ n: 1, type: 'quote', content: inline('Frase') }}
        labels={{ content: 'Citação' }}
        hidden={['n', 'type']}
        submitLabel="Salvar"
        onSubmit={vi.fn()}
      />,
    );

    const warning = screen.getByText(/sem editor para este campo/);
    expect(within(warning).getByText(/content/)).toBeTruthy();
    // No Alert de aviso do Ecme (#325).
    expect(warning.closest('.alert')?.className).toContain('bg-warning-subtle');
  });
});

describe('SchemaFields', () => {
  /** Formulário externo com dois blocos sob prefixos (o editor de conteúdo faz assim). */
  function Outer({ onSubmit }: { onSubmit: (value: FieldValues) => void }) {
    const form = useForm<FieldValues>({
      defaultValues: {
        blocks: [
          { n: 1, type: 'quote', content: inline('Um'), attribution: 'Ana' },
          { n: 2, type: 'quote', content: inline('Dois') },
        ],
      },
    });
    return (
      <FormProvider {...form}>
        <form onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}>
          {[0, 1].map((index) => (
            <SchemaFields
              key={index}
              schema={QuoteBlockSchema}
              prefix={`blocks.${index}`}
              labels={{
                'blocks.*.attribution': `Autoria ${index + 1}`,
                'blocks.*.content': `Citação ${index + 1}`,
              }}
              hidden={['blocks.*.n', 'blocks.*.type', 'blocks.*.sourceUrl']}
              fields={{ 'blocks.*.content': PlainInlines }}
            />
          ))}
          <button type="submit">Salvar</button>
        </form>
      </FormProvider>
    );
  }

  it('desenha os campos sob o prefixo e grava no formulário externo', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Outer onSubmit={onSubmit} />);

    expect(screen.getByLabelText<HTMLInputElement>(fieldLabel('Autoria 1')).value).toBe('Ana');
    await user.type(screen.getByLabelText(fieldLabel('Autoria 2')), 'Bia');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const value = onSubmit.mock.calls[0]?.[0] as { blocks: { attribution?: string; n: number }[] };
    expect(value.blocks.map((block) => [block.n, block.attribution])).toEqual([
      [1, 'Ana'],
      [2, 'Bia'],
    ]);
  });
});

describe('SchemaForm com o servidor', () => {
  it('a recusa do servidor aparece no campo do path e a sem path no resumo', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(() =>
      Promise.resolve([
        { path: ['slug'], message: 'Já existe um autor com o slug ana neste site' },
        { path: [], message: 'Tente de novo.' },
      ]),
    );
    render(
      <SchemaForm
        schema={AuthorSchema.omit({ id: true })}
        defaultValues={{ slug: 'ana', name: 'Ana' }}
        labels={{ slug: 'Slug' }}
        submitLabel="Salvar"
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    const slug = screen.getByLabelText(fieldLabel('Slug'));
    await waitFor(() => expect(slug.getAttribute('aria-invalid')).toBe('true'));
    expect(document.getElementById(slug.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Já existe um autor com o slug ana neste site',
    );
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('Tente de novo.')).toBeTruthy();
    expect(within(alert).getByRole('button').textContent).toBe(
      'Slug: Já existe um autor com o slug ana neste site',
    );
  });

  it('durante o envio o botão mostra o rótulo pendente, fica desabilitado e não reenvia', async () => {
    const user = userEvent.setup();
    let finish: (outcome: { success: string }) => void = () => undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<{ success: string }>((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <SchemaForm
        schema={AuthorSchema.omit({ id: true })}
        defaultValues={{ slug: 'ana', name: 'Ana' }}
        labels={{ name: 'Nome' }}
        submitLabel="Criar"
        pendingLabel="Criando…"
        onSubmit={onSubmit}
      />,
    );
    render(<ToastProvider />);

    await user.click(screen.getByRole('button', { name: 'Criar' }));
    const pending = await screen.findByRole('button', { name: 'Criando…' });
    expect(pending).toHaveProperty('disabled', true);
    await user.click(pending);
    await user.type(screen.getByLabelText(fieldLabel('Nome')), '{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);

    finish({ success: 'Autor salvo.' });
    // A confirmação vai para o toast do template, na região status do ToastProvider (#325).
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Autor salvo.'));
    expect(screen.getByRole('status').querySelector('.notification')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Criar' })).toHaveProperty('disabled', false);
  });

  it('sem rótulo pendente usa "Salvando…"; envio sem confirmação não mostra toast', async () => {
    const user = userEvent.setup();
    const outcomes: ((outcome: { success: string } | undefined) => void)[] = [];
    const onSubmit = vi.fn(
      () =>
        new Promise<{ success: string } | undefined>((resolve) => {
          outcomes.push(resolve);
        }),
    );
    render(
      <SchemaForm
        schema={AuthorSchema.omit({ id: true })}
        defaultValues={{ slug: 'ana', name: 'Ana' }}
        submitLabel="Salvar"
        onSubmit={onSubmit}
      />,
    );
    render(<ToastProvider />);

    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('button', { name: 'Salvando…' })).toBeTruthy();
    outcomes[0]?.(undefined);
    await screen.findByRole('button', { name: 'Salvar' });
    expect(screen.getByRole('status').textContent).toBe('');

    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    outcomes[1]?.({ success: 'Salvo.' });
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Salvo.'));
  });

  it('rich text opcional apagado é enviado como ausente, sem erro', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <SchemaForm
        schema={InstitutionalTextsSchema}
        defaultValues={{ about: inline('Sobre') }}
        labels={{ about: 'Sobre' }}
        hidden={['contact', 'terms', 'privacy', 'editorialPolicy']}
        fields={{ about: PlainInlines }}
        submitLabel="Salvar"
        onSubmit={onSubmit}
      />,
    );

    await user.clear(screen.getByLabelText(fieldLabel('Sobre')));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ about: undefined });
  });
});

describe('SchemaForm: foco, dica do boolean e só leitura', () => {
  /** Campo registrado que liga o `ref` ao controle. */
  function Choice({ id, value, onChange, invalid, describedBy, ref }: FieldProps) {
    return (
      <select
        id={id}
        ref={ref}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="padrao">padrao</option>
        <option value="revista">revista</option>
      </select>
    );
  }

  const schema = z.object({ siteId: z.string(), preset: z.string(), indexavel: z.boolean() });

  it('erro do servidor num campo registrado recebe o foco', async () => {
    const user = userEvent.setup();
    render(
      <SchemaForm
        schema={schema}
        defaultValues={{ siteId: 'a', preset: 'padrao', indexavel: false }}
        labels={{ preset: 'Preset' }}
        fields={{ preset: Choice }}
        submitLabel="Salvar"
        onSubmit={() => [{ path: ['preset'], message: 'Preset não suportado' }]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    const preset = screen.getByLabelText(fieldLabel('Preset'));
    await waitFor(() => expect(document.activeElement).toBe(preset));
    expect(preset.getAttribute('aria-invalid')).toBe('true');
  });

  it('a mensagem de erro do FormItem chega ao campo registrado, junto da dica', async () => {
    const user = userEvent.setup();
    render(
      <SchemaForm
        schema={schema}
        defaultValues={{ siteId: 'a', preset: 'padrao', indexavel: false }}
        labels={{ preset: 'Preset' }}
        hints={{ preset: 'Vem da release.' }}
        fields={{ preset: Choice }}
        submitLabel="Salvar"
        onSubmit={() => [{ path: ['preset'], message: 'Preset não suportado' }]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    const preset = screen.getByLabelText(fieldLabel('Preset'));
    await waitFor(() => expect(preset.getAttribute('aria-invalid')).toBe('true'));
    const described = (preset.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent);
    expect(described).toEqual(['Vem da release.', 'Preset não suportado']);
  });

  it('erro no boolean: a caixa fica inválida, com a mensagem ligada', async () => {
    const user = userEvent.setup();
    render(
      <SchemaForm
        schema={schema}
        defaultValues={{ siteId: 'a', preset: 'padrao', indexavel: false }}
        labels={{ indexavel: 'Indexável' }}
        fields={{ preset: Choice }}
        submitLabel="Salvar"
        onSubmit={() => [{ path: ['indexavel'], message: 'Exige o G1 registrado' }]}
      />,
    );

    const indexavel = screen.getByRole('checkbox', { name: 'Indexável' });
    await user.click(indexavel);
    expect(indexavel).toHaveProperty('checked', true);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(indexavel.getAttribute('aria-invalid')).toBe('true'));
    expect(document.activeElement).toBe(indexavel);
    expect(
      document.getElementById(indexavel.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('Exige o G1 registrado');
  });

  it('a dica do boolean fica ligada por aria-describedby; só leitura vira readonly', () => {
    render(
      <SchemaForm
        schema={schema}
        defaultValues={{ siteId: 'a', preset: 'padrao', indexavel: false }}
        labels={{ siteId: 'SITE_ID', preset: 'Preset', indexavel: 'Indexável' }}
        hints={{ indexavel: 'Ligar exige o G1 registrado.' }}
        readOnly={['siteId']}
        fields={{ preset: Choice }}
        submitLabel="Salvar"
        onSubmit={vi.fn()}
      />,
    );

    const indexavel = screen.getByLabelText(fieldLabel('Indexável'));
    expect(
      document.getElementById(indexavel.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('Ligar exige o G1 registrado.');
    expect(screen.getByLabelText(fieldLabel('SITE_ID')).hasAttribute('readonly')).toBe(true);
  });
});

describe('SchemaForm: resumo de erros', () => {
  const faqLabels = {
    items: 'Perguntas',
    'items.*': 'pergunta',
    'items.*.question': 'Pergunta',
    'items.*.answer': 'Resposta',
  };

  function renderFaq(items: unknown[]) {
    render(
      <SchemaForm
        schema={FaqBlockSchema}
        defaultValues={{ n: 1, type: 'faq', items }}
        labels={faqLabels}
        hidden={['n', 'type']}
        fields={{ 'items.*.answer': PlainInlines }}
        submitLabel="Salvar"
        onSubmit={vi.fn()}
      />,
    );
  }

  it('lista cada campo inválido, com a posição na lista, e cada item leva o foco ao campo', async () => {
    const user = userEvent.setup();
    renderFaq([
      { question: 'P1', answer: inline('R1') },
      { question: '', answer: [] },
    ]);

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    // A mesma região, que já estava montada, recebe o conteúdo: é anunciada ao mudar.
    await waitFor(() => expect(screen.getByRole('alert')).toBe(alert));
    const items = await within(alert).findAllByRole('button');
    expect(items.map((item) => item.textContent?.split(':')[0])).toEqual([
      'Pergunta (pergunta 2)',
      'Resposta (pergunta 2)',
    ]);
    expect(within(alert).getByText('Corrija os campos destacados:')).toBeTruthy();
    // No Alert danger do Ecme, dentro da região (#325).
    expect(alert.querySelector('.alert')?.className).toContain('bg-error-subtle');

    // Campo nativo dentro da lista.
    items[0]?.focus();
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(screen.getAllByLabelText(fieldLabel('Pergunta'))[1]);

    // Campo registrado dentro da lista.
    await user.click(items[1] as HTMLElement);
    expect(document.activeElement).toBe(screen.getAllByLabelText(fieldLabel('Resposta'))[1]);
  });

  it('o resumo acompanha a correção: o campo corrigido sai da lista', async () => {
    const user = userEvent.setup();
    renderFaq([{ question: '', answer: inline('R1') }]);

    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    const item = await within(screen.getByRole('alert')).findByRole('button');
    expect(item.textContent).toMatch(/^Pergunta \(pergunta 1\): /);

    await user.type(screen.getByLabelText(fieldLabel('Pergunta')), 'P1');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(''));
  });

  it('o erro da lista inteira aparece com o rótulo da lista, sem link', async () => {
    const user = userEvent.setup();
    renderFaq([]);

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    const alert = screen.getByRole('alert');
    await waitFor(() =>
      expect(within(alert).getByRole('listitem').textContent).toMatch(/^Perguntas: /),
    );
    expect(within(alert).queryByRole('button')).toBeNull();
  });
});

describe('SchemaForm: seções com índice', () => {
  const schema = z.object({
    name: z.string(),
    theme: z.string(),
    indexavel: z.boolean(),
    extra: z.string(),
  });

  function renderSections() {
    render(
      <SchemaForm
        schema={schema}
        defaultValues={{ name: 'A', theme: 'padrao', indexavel: false, extra: '' }}
        labels={{ name: 'Nome', theme: 'Tema', indexavel: 'Indexável', extra: 'Extra' }}
        sections={[
          { id: 'identidade', title: 'Identidade', paths: ['name'] },
          { id: 'aparencia', title: 'Aparência', paths: ['theme', 'indexavel'] },
        ]}
        submitLabel="Salvar"
        onSubmit={vi.fn()}
      />,
    );
  }

  it('cada seção tem um h2 e só os seus campos; a chave fora de seção vem depois', () => {
    renderSections();

    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual(['Identidade', 'Aparência']);
    const identity = screen.getByRole('region', { name: 'Identidade' });
    expect(within(identity).getByLabelText(fieldLabel('Nome'))).toBeTruthy();
    expect(within(identity).queryByLabelText(fieldLabel('Tema'))).toBeNull();
    const look = screen.getByRole('region', { name: 'Aparência' });
    expect(within(look).getByLabelText(fieldLabel('Tema'))).toBeTruthy();
    expect(within(look).getByLabelText(fieldLabel('Indexável'))).toBeTruthy();
    // Fora de toda seção: aparece, depois da última.
    const extra = screen.getByLabelText(fieldLabel('Extra'));
    expect(look.contains(extra)).toBe(false);
    expect(look.compareDocumentPosition(extra) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('o índice no topo liga cada item à âncora do título da seção', () => {
    renderSections();

    const nav = screen.getByRole('navigation', { name: 'Seções do formulário' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Identidade', 'Aparência']);
    for (const link of links) {
      const target = document.getElementById(link.getAttribute('href')?.slice(1) ?? '');
      expect(target?.tagName).toBe('H2');
      expect(target?.textContent).toBe(link.textContent);
    }
    // No topo: antes do primeiro campo.
    expect(
      nav.compareDocumentPosition(screen.getByLabelText(fieldLabel('Nome'))) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('sem seções não há índice nem h2', () => {
    render(
      <SchemaForm
        schema={schema}
        defaultValues={{ name: 'A', theme: 'padrao', indexavel: false, extra: '' }}
        submitLabel="Salvar"
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('heading')).toBeNull();
  });
});

describe('SchemaForm: formulário de tela (#328)', () => {
  const schema = z.object({ name: z.string().min(1), slug: z.string(), bio: z.string() });
  const labels = { name: 'Nome', slug: 'Slug', bio: 'Biografia' };

  afterEach(() => vi.clearAllMocks());

  it('sem seções, todos os campos num Card só; pares lado a lado a partir de md', () => {
    render(
      <SchemaForm
        schema={schema}
        defaultValues={{ name: 'A', slug: 'a', bio: '' }}
        labels={labels}
        sideBySide={[['name', 'slug']]}
        actionBar={{ kind: 'edit', href: '/sites/x/autores' }}
        contentClassName="form-width"
        submitLabel="Salvar"
        onSubmit={vi.fn()}
      />,
    );

    const cards = document.querySelectorAll('.card');
    expect(cards).toHaveLength(1);
    for (const label of ['Nome', 'Slug', 'Biografia']) {
      expect(cards[0]?.contains(screen.getByLabelText(fieldLabel(label)))).toBe(true);
    }
    const pair = screen.getByLabelText(fieldLabel('Nome')).closest('.grid');
    expect(pair?.className.split(' ')).toEqual(
      expect.arrayContaining(['grid', 'md:grid-cols-2', 'gap-4']),
    );
    expect(pair?.contains(screen.getByLabelText(fieldLabel('Slug')))).toBe(true);
    expect(pair?.contains(screen.getByLabelText(fieldLabel('Biografia')))).toBe(false);
    // A coluna de cartões leva a largura que a página deu.
    expect(cards[0]?.closest('.form-width')).not.toBeNull();
  });

  it('pares dentro de lista: o caminho com * agrupa os campos de cada item', () => {
    render(
      <SchemaForm
        schema={z.object({
          items: z.array(z.object({ label: z.string(), href: z.string() })),
        })}
        defaultValues={{ items: [{ label: 'A', href: '/a' }] }}
        labels={{
          items: 'Itens',
          'items.*': 'item',
          'items.*.label': 'Rótulo',
          'items.*.href': 'Link',
        }}
        sideBySide={[['items.*.label', 'items.*.href']]}
        submitLabel="Salvar"
        onSubmit={vi.fn()}
      />,
    );

    const pair = screen.getByLabelText(fieldLabel('Rótulo')).closest('.grid');
    expect(pair?.contains(screen.getByLabelText(fieldLabel('Link')))).toBe(true);
  });

  it('edição: Voltar é um link para a tela anterior e o envio fica na barra', () => {
    render(
      <SchemaForm
        schema={schema}
        defaultValues={{ name: 'A', slug: 'a', bio: '' }}
        labels={labels}
        actionBar={{ kind: 'edit', href: '/sites/x/autores' }}
        submitLabel="Salvar"
        onSubmit={vi.fn()}
      />,
    );

    const back = screen.getByRole('link', { name: 'Voltar' });
    expect(back.getAttribute('href')).toBe('/sites/x/autores');
    const bar = back.closest('.sticky');
    expect(bar).not.toBeNull();
    expect(bar?.contains(screen.getByRole('button', { name: 'Salvar' }))).toBe(true);
    expect(screen.queryByRole('button', { name: 'Descartar' })).toBeNull();
  });

  it('criação: Descartar confirma; Cancelar fica com o que foi digitado, Confirmar sai sem enviar', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <SchemaForm
        schema={schema}
        defaultValues={{ name: '', slug: '', bio: '' }}
        labels={labels}
        actionBar={{ kind: 'create', href: '/sites/x/autores' }}
        submitLabel="Criar"
        onSubmit={onSubmit}
      />,
    );
    await user.type(screen.getByLabelText(fieldLabel('Nome')), 'Ana');
    const discard = screen.getByRole('button', { name: 'Descartar' });
    expect(discard.className).toContain('text-error');
    expect(screen.queryByRole('link', { name: 'Voltar' })).toBeNull();

    await user.click(discard);
    const dialog = screen.getByRole('alertdialog', { name: 'Descartar o que foi preenchido?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByLabelText<HTMLInputElement>(fieldLabel('Nome')).value).toBe('Ana');
    expect(router.push).not.toHaveBeenCalled();

    await user.click(discard);
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Descartar' }),
    );
    expect(router.push).toHaveBeenCalledWith('/sites/x/autores');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('um segundo clique ou Enter durante o envio não dispara outro envio', async () => {
    const user = userEvent.setup();
    let finish: () => void = () => {};
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    render(
      <SchemaForm
        schema={schema}
        defaultValues={{ name: 'Ana', slug: 'ana', bio: '' }}
        labels={labels}
        actionBar={{ kind: 'create', href: '/sites/x/autores' }}
        submitLabel="Criar"
        pendingLabel="Criando…"
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Criar' }));
    const pending = await screen.findByRole('button', { name: 'Criando…' });
    await user.click(pending);
    await user.type(screen.getByLabelText(fieldLabel('Nome')), '{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Criar' })).toBeTruthy());
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('sem actionBar não há barra fixa nem cartão (formulário dentro de outra tela)', () => {
    render(
      <SchemaForm
        schema={schema}
        defaultValues={{ name: 'A', slug: 'a', bio: '' }}
        labels={labels}
        submitLabel="Aprovar"
        onSubmit={vi.fn()}
      />,
    );

    expect(document.querySelector('.sticky')).toBeNull();
    expect(document.querySelector('.card')).toBeNull();
    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeTruthy();
  });
});

describe('SchemaForm: formulário em cartão (#333)', () => {
  const schema = z.object({ seconds: z.number({ error: 'Informe os segundos.' }).int().min(0) });
  const labels = { seconds: 'Segundos' };

  it('introdução e campos no corpo do Card, botões no rodapé dele, sem barra fixa', () => {
    render(
      <SchemaForm
        schema={schema}
        defaultValues={{ seconds: 30 }}
        labels={labels}
        card={{
          intro: <h2>Janela</h2>,
          extra: {
            label: 'Usar padrão',
            pendingLabel: 'Usando padrão…',
            run: vi.fn(() => Promise.resolve({ success: 'ok' })),
          },
        }}
        submitLabel="Salvar"
        onSubmit={vi.fn()}
      />,
    );

    expect(document.querySelector('.sticky')).toBeNull();
    const cards = document.querySelectorAll('.card');
    expect(cards).toHaveLength(1);
    const body = cards[0]?.querySelector('.card-body');
    expect(body?.contains(screen.getByRole('heading', { name: 'Janela' }))).toBe(true);
    expect(body?.contains(screen.getByLabelText(fieldLabel('Segundos')))).toBe(true);
    const footer = cards[0]?.querySelector('.card-footer');
    const save = screen.getByRole('button', { name: 'Salvar' });
    const extra = screen.getByRole('button', { name: 'Usar padrão' });
    expect(footer?.contains(save)).toBe(true);
    expect(footer?.contains(extra)).toBe(true);
    // Mesmo tamanho; a ação principal é a solid.
    const size = (button: HTMLElement) =>
      button.className.split(' ').filter((name) => /^(h-|px-|text-(sm|base|lg))/.test(name));
    expect(size(extra)).toEqual(size(save));
    expect(save.className).toContain('bg-primary');
    expect(extra.className).not.toContain('bg-primary');
  });

  it('a ação secundária não passa pelo schema, limpa o campo e mostra o retorno no toast', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const run = vi.fn(() => Promise.resolve({ success: 'Janela padrão restaurada.' }));
    render(
      <SchemaForm
        schema={schema}
        defaultValues={{ seconds: 30 }}
        labels={labels}
        card={{
          extra: {
            label: 'Usar padrão',
            pendingLabel: 'Usando padrão…',
            resetTo: { seconds: '' },
            run,
          },
        }}
        submitLabel="Salvar"
        onSubmit={onSubmit}
      />,
    );
    render(<ToastProvider />);
    const input = screen.getByLabelText<HTMLInputElement>(fieldLabel('Segundos'));
    await user.clear(input);
    await user.type(input, '-1');

    await user.click(screen.getByRole('button', { name: 'Usar padrão' }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Janela padrão restaurada.'),
    );
    expect(input.value).toBe('');
    expect(input.getAttribute('aria-invalid')).not.toBe('true');
  });

  it('durante a ação secundária, ela mostra a pendência e os dois botões ficam desabilitados', async () => {
    const user = userEvent.setup();
    let finish: (value: { success: string }) => void = () => undefined;
    const run = vi.fn(
      () =>
        new Promise<{ success: string }>((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <SchemaForm
        schema={schema}
        defaultValues={{ seconds: 30 }}
        labels={labels}
        card={{ extra: { label: 'Usar padrão', pendingLabel: 'Usando padrão…', run } }}
        submitLabel="Salvar"
        onSubmit={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Usar padrão' }));
    const pending = await screen.findByRole('button', { name: 'Usando padrão…' });
    expect(pending).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Salvar' })).toHaveProperty('disabled', true);

    finish({ success: 'ok' });
    expect(await screen.findByRole('button', { name: 'Usar padrão' })).toHaveProperty(
      'disabled',
      false,
    );
  });

  it('recusa da ação secundária com path vira erro do campo', async () => {
    const user = userEvent.setup();
    render(
      <SchemaForm
        schema={schema}
        defaultValues={{ seconds: 30 }}
        labels={labels}
        card={{
          extra: {
            label: 'Usar padrão',
            pendingLabel: 'Usando padrão…',
            run: () => Promise.resolve([{ path: ['seconds'], message: 'Recusado pelo domínio.' }]),
          },
        }}
        submitLabel="Salvar"
        onSubmit={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Usar padrão' }));
    await waitFor(() =>
      expect(screen.getByLabelText(fieldLabel('Segundos')).getAttribute('aria-invalid')).toBe(
        'true',
      ),
    );
    expect(screen.getAllByText('Recusado pelo domínio.').length).toBeGreaterThan(0);
  });
});

describe('SchemaForm: erro, dica e obrigatório no FormItem (#329)', () => {
  const schema = z.object({
    titulo: z.string().min(1, 'Informe o título'),
    apelido: z.string().optional(),
    ordem: z.number().min(1, 'Ordem a partir de 1'),
    tipo: z.enum(['a', 'b']),
    aceito: z.boolean().refine((value) => value, 'Marque para continuar'),
    itens: z.array(z.object({ nome: z.string() })).min(1, 'Inclua pelo menos um item'),
  });
  const labels = {
    titulo: 'Título',
    apelido: 'Apelido',
    ordem: 'Ordem',
    tipo: 'Tipo',
    aceito: 'Aceito',
    itens: 'Itens',
    'itens.*': 'item',
  };

  function renderForm(onSubmit = vi.fn()) {
    render(
      <SchemaForm
        schema={schema}
        defaultValues={{ titulo: '', ordem: 0, tipo: 'a', aceito: false, itens: [] }}
        labels={labels}
        hints={{ titulo: 'Aparece no topo da página.', aceito: 'Obrigatório para publicar.' }}
        submitLabel="Salvar"
        onSubmit={onSubmit}
      />,
    );
  }

  /** Ids do `aria-describedby` do elemento e os textos que eles apontam. */
  const described = (element: Element) =>
    (element.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .filter(Boolean)
      .map((id) => document.getElementById(id));

  it('cada tipo de campo mostra o erro na mensagem do FormItem, ligada ao campo', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    const cases: [Element, string][] = [
      [screen.getByLabelText(fieldLabel('Título')), 'Informe o título'],
      [screen.getByLabelText(fieldLabel('Ordem')), 'Ordem a partir de 1'],
      [screen.getByRole('checkbox', { name: 'Aceito' }), 'Marque para continuar'],
      [screen.getByRole('group', { name: 'Itens' }), 'Inclua pelo menos um item'],
    ];
    for (const [control, message] of cases) {
      await waitFor(() => {
        const error = described(control).find((element) => element?.textContent === message);
        expect(error?.className).toContain('form-explain');
      });
    }
    expect(document.querySelector('.font-semibold.text-error:not(.form-explain)')).toBeNull();
  });

  it('a escolha (enum) com erro do servidor também fica ligada à mensagem do FormItem', async () => {
    const user = userEvent.setup();
    render(
      <SchemaForm
        schema={z.object({ tipo: z.enum(['a', 'b']) })}
        defaultValues={{ tipo: 'a' }}
        labels={{ tipo: 'Tipo' }}
        submitLabel="Salvar"
        onSubmit={() => [{ path: ['tipo'], message: 'Tipo indisponível' }]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    const select = screen.getByLabelText(fieldLabel('Tipo'));
    await waitFor(() =>
      expect(described(select).map((element) => element?.className)).toContain('form-explain'),
    );
  });

  it('a dica sai do FormItem e fica ligada ao campo, inclusive na caixa de seleção', () => {
    renderForm();

    for (const [control, hint] of [
      [screen.getByLabelText(fieldLabel('Título')), 'Aparece no topo da página.'],
      [screen.getByRole('checkbox', { name: 'Aceito' }), 'Obrigatório para publicar.'],
    ] as const) {
      const [element] = described(control);
      expect(element?.textContent).toBe(hint);
      expect(element?.className).toContain('form-hint');
    }
  });

  it('não opcional leva asterisco e aria-required; opcional e caixa de seleção não', () => {
    renderForm();

    for (const name of ['Título', 'Ordem', 'Tipo']) {
      const control = screen.getByLabelText(fieldLabel(name));
      expect(control.getAttribute('aria-required')).toBe('true');
      expect(document.querySelector(`label[for="${control.id}"]`)?.textContent).toBe(`*${name}`);
    }
    const optional = screen.getByLabelText('Apelido');
    expect(optional.hasAttribute('aria-required')).toBe(false);
    const checkbox = screen.getByRole('checkbox', { name: 'Aceito' });
    expect(checkbox.closest('label')?.textContent).toBe('Aceito');
    expect(checkbox.hasAttribute('aria-required')).toBe(false);
  });
});

describe('SchemaForm: enum no Select do Ecme (#330)', () => {
  const schema = z.object({ tipo: z.enum(['a', 'b']) });

  it('escolhe só com teclado e entrega a mesma string da opção', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <SchemaForm
        schema={schema}
        defaultValues={{ tipo: 'a' }}
        labels={{ tipo: 'Tipo', 'tipo=a': 'Opção A', 'tipo=b': 'Opção B' }}
        hints={{ tipo: 'Define o formato.' }}
        submitLabel="Salvar"
        onSubmit={onSubmit}
      />,
    );

    const tipo = screen.getByRole('combobox', { name: fieldLabel('Tipo') });
    expect(screen.getByText('Opção A')).toBeTruthy();
    const ids = (tipo.getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toContain(
      'Define o formato.',
    );

    tipo.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(screen.getByText('Opção B')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ tipo: 'b' }));
  });

  it('a recusa do servidor deixa o combobox inválido e com o foco', async () => {
    const user = userEvent.setup();
    render(
      <SchemaForm
        schema={schema}
        defaultValues={{ tipo: 'a' }}
        labels={{ tipo: 'Tipo' }}
        submitLabel="Salvar"
        onSubmit={() => [{ path: ['tipo'], message: 'Tipo indisponível' }]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    const tipo = screen.getByRole('combobox', { name: fieldLabel('Tipo') });
    await waitFor(() => expect(document.activeElement).toBe(tipo));
    expect(tipo.getAttribute('aria-invalid')).toBe('true');
  });
});
