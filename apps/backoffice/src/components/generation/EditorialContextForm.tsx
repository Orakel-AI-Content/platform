'use client';

import { useRouter } from 'next/navigation';
import * as z from 'zod';

import { SchemaForm, type FieldProps } from '@/components/forms/SchemaForm';
import { pushSuccess } from '@/components/shared/ActionFeedback.tsx';
import type { EntityFormResult } from '@/components/editorial/EntityForms';
import Input from '@/components/ui/Input';

// Nova versão do contexto editorial (RN-GEN-05): um texto livre, num formulário como o dos
// textos institucionais; o domínio grava a N+1 e recusa texto vazio (o erro volta no campo).

const EditorialContextSchema = z.object({
  body: z.string().trim().min(1, 'Escreva o contexto editorial'),
});

const LABELS = { body: 'Contexto editorial' };
const HINTS = {
  body: 'Público, tom, assuntos e o que evitar. Salvar cria uma versão nova; as anteriores ficam.',
};

function BodyField({
  id,
  value,
  onChange,
  invalid,
  describedBy,
  required,
  ref,
  readOnly,
}: FieldProps) {
  return (
    <Input
      textArea
      id={id}
      // O `ref` do Input do Ecme também admite um componente; o foco do erro só precisa do DOM.
      ref={(element) => ref(element instanceof HTMLElement ? element : null)}
      rows={16}
      readOnly={readOnly}
      aria-invalid={invalid}
      aria-required={required || undefined}
      aria-describedby={describedBy}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

const FIELDS = { body: (props: FieldProps) => <BodyField {...props} /> };

export function EditorialContextForm({
  siteId,
  defaultBody,
  action,
  contentClassName,
}: {
  siteId: string;
  /** Texto da versão atual, ponto de partida da nova (vazio sem versões). */
  defaultBody: string;
  action: (value: unknown) => Promise<EntityFormResult>;
  /** Largura da coluna de cartões e da barra, dada pela página (`form-width`). */
  contentClassName?: string;
}) {
  const router = useRouter();
  const list = `/sites/${siteId}/contextos`;
  return (
    <SchemaForm
      schema={EditorialContextSchema}
      defaultValues={{ body: defaultBody }}
      labels={LABELS}
      hints={HINTS}
      fields={FIELDS}
      actionBar={{ kind: 'create', href: list }}
      contentClassName={contentClassName}
      submitLabel="Salvar versão"
      pendingLabel="Salvando…"
      onSubmit={async (value) => {
        const result = await action(value);
        if (!result.ok) {
          return result.issues.length > 0 ? result.issues : [{ path: [], message: result.message }];
        }
        // O toast vive no layout raiz: o aviso continua na lista para onde a tela volta.
        pushSuccess(result.message);
        router.push(list);
        router.refresh();
      }}
    />
  );
}
