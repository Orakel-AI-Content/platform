'use client';

import Link from 'next/link';
import { useState } from 'react';
import { TbPlus } from 'react-icons/tb';
import type { SelectInstance } from 'react-select';
import * as z from 'zod';

import type { EntityFormResult } from '@/components/editorial/EntityForms';
import { SchemaForm, selectInFormItem, type FieldProps } from '@/components/forms/SchemaForm';
import type { PickerOption } from '@/components/forms/PickerFields';
import { pushSuccess } from '@/components/shared/ActionFeedback.tsx';
import { SECTION_HINT_CLASS, SECTION_TITLE_CLASS } from '@/components/shared/sectionText.ts';
import Alert from '@/components/ui/Alert';
import ButtonLink from '@/components/ui/Button/ButtonLink';
import Card from '@/components/ui/Card';
import Select from '@/components/ui/Select';

// Disparo da geração de um artigo (R1, R5): tema e autor num formulário em cartão dentro da
// aba, como os da página do site (#333), acima da lista das execuções. A versão do contexto
// editorial é a vigente, só para leitura (o domínio grava sempre ela). Permissão, tema vazio,
// autor de outro site e site sem contexto: o domínio recusa, e o erro volta no campo.
// Site sem contexto (#600): o aviso aparece para qualquer papel, e quem tem `content.write`
// ganha nele a ação seguinte, "Criar contexto editorial". Com contexto, só quem escreve vê o
// formulário.

const GenerationSchema = z.object({
  topic: z.string().trim().min(1, 'Escreva o tema do artigo'),
  authorId: z.number({ error: 'Escolha o autor' }).int(),
});

const LABELS = { topic: 'Tema ou palavra-chave', authorId: 'Autor' };
const HINTS = { topic: 'Um tema por disparo: a execução gera um artigo, que vai para a revisão.' };

const LINK_CLASS = 'font-semibold underline underline-offset-4 hover:text-primary';

/** Autor do artigo no `Select` do Ecme (um só), como o enum do `SchemaForm`. */
function authorField(options: readonly PickerOption[]) {
  function AuthorField({ name, value, onChange, required, ref }: FieldProps) {
    return (
      <Select<PickerOption>
        // O foco do erro (inclusive do servidor) cai no campo de texto do combobox.
        field={{
          ref: (select: SelectInstance<PickerOption> | null) => ref(select?.inputRef ?? null),
        }}
        name={name}
        options={options}
        getOptionValue={(option) => String(option.id)}
        value={options.find((option) => option.id === value) ?? null}
        onChange={(option) => onChange(option?.id)}
        required={required}
        placeholder="Escolha"
        noOptionsMessage={() => 'Nenhuma opção'}
        components={selectInFormItem}
      />
    );
  }
  return AuthorField;
}

/** Contexto vigente que a execução vai seguir; sem ele, o aviso no lugar do formulário. */
export type CurrentContext = { version: number } | undefined;

export function GenerationForm({
  siteId,
  canWrite,
  authors,
  context,
  action,
}: {
  siteId: string;
  /** `content.write`: sem ela, só o aviso de site sem contexto (sem a ação); senão, nada. */
  canWrite: boolean;
  /** Autores do site (`readAuthors`), as opções do campo. */
  authors: readonly PickerOption[];
  context: CurrentContext;
  action: (value: unknown) => Promise<EntityFormResult>;
}) {
  // Disparo aceito: o formulário volta ao vazio (remontado) para o próximo tema.
  const [round, setRound] = useState(0);
  const contexts = `/sites/${siteId}/contextos`;
  const contextsLink = (
    <Link href={contexts} className={LINK_CLASS}>
      Contextos editoriais
    </Link>
  );
  const title = (
    <h2 id="generation-form-title" className={SECTION_TITLE_CLASS}>
      Gerar artigo
    </h2>
  );

  if (context === undefined) {
    return (
      <Card bodyClass="space-y-3" aria-labelledby="generation-form-title">
        {title}
        <Alert type="warning" showIcon duration={0}>
          {canWrite ? (
            // Em flex (#876): solto num bloco comum, o `ButtonLink` (um `<a>` inline) partia o
            // fundo e deixava o texto branco sobre o amarelo do alerta.
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm">Cadastre o contexto editorial do site antes de gerar.</p>
              <ButtonLink
                href={`${contexts}/nova`}
                size="sm"
                variant="solid"
                icon={<TbPlus className="text-xl" aria-hidden />}
              >
                Criar contexto editorial
              </ButtonLink>
            </div>
          ) : (
            <p className="text-sm">
              O site ainda não tem contexto editorial: sem ele, não dá para gerar artigos.
            </p>
          )}
        </Alert>
      </Card>
    );
  }
  if (!canWrite) return null;
  if (authors.length === 0) {
    return (
      <Card bodyClass="space-y-3" aria-labelledby="generation-form-title">
        {title}
        <Alert type="warning" showIcon duration={0}>
          <p className="text-sm">
            Cadastre um autor no site antes de gerar:{' '}
            <Link href={`/sites/${siteId}/autores`} className={LINK_CLASS}>
              Autores
            </Link>
            .
          </p>
        </Alert>
      </Card>
    );
  }

  const intro = (
    <>
      {title}
      <p className={SECTION_HINT_CLASS}>
        Contexto editorial: <strong>v{context.version}</strong> (vigente). Para mudar, crie uma
        versão nova em {contextsLink}.
      </p>
    </>
  );

  return (
    <SchemaForm
      key={round}
      schema={GenerationSchema}
      defaultValues={{ topic: '', authorId: authors.length === 1 ? authors[0]?.id : undefined }}
      labels={LABELS}
      hints={HINTS}
      fields={{ authorId: authorField(authors) }}
      sideBySide={[['topic', 'authorId']]}
      card={{ intro }}
      submitLabel="Gerar artigo"
      pendingLabel="Enfileirando…"
      onSubmit={async (value) => {
        const result = await action(value);
        if (!result.ok) {
          return result.issues.length > 0 ? result.issues : [{ path: [], message: result.message }];
        }
        pushSuccess(result.message);
        setRound((current) => current + 1);
      }}
    />
  );
}
