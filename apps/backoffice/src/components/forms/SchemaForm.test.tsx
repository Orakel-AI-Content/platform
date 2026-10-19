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
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';

import { toast, ToastProvider } from '@/components/ui/toast';

import { SchemaFields, SchemaForm, type FieldProps } from './SchemaForm.tsx';

// Gerador de formulários (#42): campos por tipo, listas, registro, erros e teclado.

// A mensagem de erro do FormItem (#245) anima com o motion, que o happy-dom cancela no `cleanup`.
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

    expect(screen.getByLabelText('Citação')).toHaveProperty('value', 'Frase');
    expect(screen.getByLabelText('Autoria')).toBeTruthy();
    expect(screen.getByLabelText('Fonte')).toBeTruthy();
    expect(screen.queryByLabelText('n')).toBeNull();
    expect(screen.queryByLabelText('type')).toBeNull();
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

    expect(screen.getAllByLabelText('Pergunta')).toHaveLength(1);
    const add = screen.getByRole('button', { name: 'Adicionar pergunta' });
    add.focus();
    await user.keyboard('{Enter}');
    expect(screen.getAllByLabelText('Pergunta')).toHaveLength(2);

    // Preenche a nova pergunta só com Tab e digitação.
    await user.click(screen.getAllByLabelText('Pergunta')[0] as HTMLElement);
    await user.tab();
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(screen.getAllByLabelText('Pergunta')[1]);
    await user.keyboard('P2');
    await user.tab();
    await user.keyboard('R2');

    screen.getByRole('button', { name: 'Remover pergunta 1' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getAllByLabelText('Pergunta')).toHaveLength(1);

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
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    const name = screen.getByLabelText('name');
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
    expect(screen.getByLabelText('bio').getAttribute('aria-invalid')).toBe('false');
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

    const alt = screen.getByLabelText('alt');
    await waitFor(() => expect(alt.getAttribute('aria-invalid')).toBe('true'));
    expect(document.getElementById(alt.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Informe o texto alternativo ou marque a imagem como decorativa',
    );

    // Marcar decorativa resolve.
    await user.click(screen.getByLabelText('decorative'));
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

    expect(screen.getByLabelText('Mídia (seletor)').tagName).toBe('SELECT');
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

    expect(screen.getByLabelText<HTMLInputElement>('Autoria 1').value).toBe('Ana');
    await user.type(screen.getByLabelText('Autoria 2'), 'Bia');
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

    const slug = screen.getByLabelText('Slug');
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
    await user.type(screen.getByLabelText('Nome'), '{Enter}');
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

    await user.clear(screen.getByLabelText('Sobre'));
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

    const preset = screen.getByLabelText('Preset');
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

    const preset = screen.getByLabelText('Preset');
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

    const indexavel = screen.getByLabelText('Indexável');
    expect(
      document.getElementById(indexavel.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('Ligar exige o G1 registrado.');
    expect(screen.getByLabelText('SITE_ID').hasAttribute('readonly')).toBe(true);
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
    expect(document.activeElement).toBe(screen.getAllByLabelText('Pergunta')[1]);

    // Campo registrado dentro da lista.
    await user.click(items[1] as HTMLElement);
    expect(document.activeElement).toBe(screen.getAllByLabelText('Resposta')[1]);
  });

  it('o resumo acompanha a correção: o campo corrigido sai da lista', async () => {
    const user = userEvent.setup();
    renderFaq([{ question: '', answer: inline('R1') }]);

    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    const item = await within(screen.getByRole('alert')).findByRole('button');
    expect(item.textContent).toMatch(/^Pergunta \(pergunta 1\): /);

    await user.type(screen.getByLabelText('Pergunta'), 'P1');
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
    expect(within(identity).getByLabelText('Nome')).toBeTruthy();
    expect(within(identity).queryByLabelText('Tema')).toBeNull();
    const look = screen.getByRole('region', { name: 'Aparência' });
    expect(within(look).getByLabelText('Tema')).toBeTruthy();
    expect(within(look).getByLabelText('Indexável')).toBeTruthy();
    // Fora de toda seção: aparece, depois da última.
    const extra = screen.getByLabelText('Extra');
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
      nav.compareDocumentPosition(screen.getByLabelText('Nome')) & Node.DOCUMENT_POSITION_FOLLOWING,
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
