'use client';

import { InstitutionalTextsSchema } from '@orakel/content-model/v1';
import { useRouter } from 'next/navigation';

import type { MediaSource } from '@/components/forms/PickerFields';
import { richTextField } from '@/components/forms/RichTextField';
import { SchemaForm, type SchemaFormIssue } from '@/components/forms/SchemaForm';
import { pushSuccess } from '@/components/shared/ActionFeedback.tsx';
import type { FormActionResult } from '@/components/shared/actionResult.ts';

import { ENTITY_CONFIG, type EntityKind } from './entityConfig.ts';

// Formulários das entidades editoriais do site (#46): o gerador sobre os schemas do
// content-model, configurados em `entityConfig.ts`; regras (slug único, permissão) ficam
// no domínio e voltam pelo campo.

/** Retorno das Server Actions das entidades (serializável; `path` aponta o campo). */
export type EntityFormResult = FormActionResult<SchemaFormIssue>;

/** Criação ou edição de autor, taxonomia ou menu; volta para a lista ao salvar. */
export function EntityForm({
  kind,
  mode,
  siteId,
  defaultValues,
  media,
  action,
}: {
  kind: EntityKind;
  mode: 'create' | 'edit';
  siteId: string;
  defaultValues: Record<string, unknown>;
  /** Biblioteca do site para o avatar (#182); as outras entidades não usam mídia. */
  media?: MediaSource;
  action: (value: unknown) => Promise<EntityFormResult>;
}) {
  const router = useRouter();
  const config = ENTITY_CONFIG[kind];
  return (
    <SchemaForm
      schema={config.schema}
      defaultValues={defaultValues}
      labels={config.labels}
      hints={config.hints}
      fields={config.fields?.(media)}
      submitLabel={mode === 'create' ? 'Criar' : 'Salvar'}
      pendingLabel={mode === 'create' ? 'Criando…' : 'Salvando…'}
      onSubmit={async (value) => {
        const result = await action(value);
        if (!result.ok) {
          return result.issues.length > 0 ? result.issues : [{ path: [], message: result.message }];
        }
        // O toast vive no layout raiz: o aviso continua na lista para onde a tela volta.
        pushSuccess(result.message);
        router.push(`/sites/${siteId}/${config.segment}`);
        router.refresh();
      }}
    />
  );
}

const INSTITUTIONAL_LABELS: Record<string, string> = {
  about: 'Sobre',
  contact: 'Contato',
  terms: 'Termos de uso',
  privacy: 'Política de privacidade',
  editorialPolicy: 'Política editorial',
};

const INSTITUTIONAL_FIELDS = Object.fromEntries(
  Object.keys(INSTITUTIONAL_LABELS).map((key) => [key, richTextField('richText')]),
);

/** Textos institucionais: cada um em rich text; salvar grava a versão nova da configuração. */
export function InstitutionalTextsForm({
  defaultValues,
  action,
}: {
  defaultValues: Record<string, unknown>;
  action: (value: unknown) => Promise<EntityFormResult>;
}) {
  const router = useRouter();
  return (
    <SchemaForm
      schema={InstitutionalTextsSchema}
      defaultValues={defaultValues}
      labels={INSTITUTIONAL_LABELS}
      fields={INSTITUTIONAL_FIELDS}
      submitLabel="Salvar textos"
      onSubmit={async (value) => {
        const result = await action(value);
        if (!result.ok) {
          return result.issues.length > 0 ? result.issues : [{ path: [], message: result.message }];
        }
        router.refresh();
        return { success: result.message };
      }}
    />
  );
}
