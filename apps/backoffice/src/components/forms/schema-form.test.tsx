// @vitest-environment happy-dom
import {
  AuthorSchema,
  FaqBlockSchema,
  ImageBlockSchema,
  InstitutionalTextsSchema,
  QuoteBlockSchema,
} from '@orakel/content-model/v1';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm, type FieldValues } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as z from 'zod';

import { SchemaFields, SchemaForm, type FieldProps } from './schema-form.tsx';

// Gerador de formulários (#42): campos por tipo, listas, registro, erros e teclado.

afterEach(cleanup);

/** Campo de rich text simplificado (o de verdade, com TipTap, é da #43). */
function PlainInlines({ id, label, value, onChange, invalid, describedBy }: FieldProps) {
  const text = Array.isArray(value)
    ? value.map((inline: { text?: string }) => inline.text ?? '').join('')
    : '';
  return (
    <textarea
      id={id}
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
    expect(screen.getByRole('alert').textContent).toBe('Corrija os campos destacados.');
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
    expect(screen.getByRole('alert').textContent).toBe('Tente de novo.');
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
