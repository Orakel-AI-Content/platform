'use client';

import { useRouter } from 'next/navigation';

import { SchemaForm, type SchemaFormIssue } from '@/components/forms/SchemaForm';
import type { FormActionResult } from '@/components/shared/actionResult.ts';
import { RegisterReleaseSchema, type RegisterReleaseValue } from '@/domain/releases/tag.ts';

/** Retorno da Server Action de cadastro (serializável; `path` aponta o campo). */
export type ReleaseFormResult = FormActionResult<SchemaFormIssue>;

export const RELEASES_HREF = '/releases';

/**
 * Cadastro de release (#509): um campo, gerado do schema da tag, na tela própria com a barra
 * de "Descartar" e "Registrar", como as outras telas de criação. Formato e duplicata ficam no
 * domínio e voltam pelo campo; ao registrar, volta para a lista, que anuncia a confirmação.
 */
export function ReleaseForm({
  action,
  contentClassName,
}: {
  action: (value: RegisterReleaseValue) => Promise<ReleaseFormResult>;
  /** Largura da coluna de cartões e da barra, dada pela página (`form-width`). */
  contentClassName?: string;
}) {
  const router = useRouter();
  return (
    <SchemaForm
      schema={RegisterReleaseSchema}
      defaultValues={{ tag: '' }}
      labels={{ tag: 'Tag' }}
      hints={{
        tag: 'Versão da imagem site-builder já publicada no GHCR, no formato X.Y.Z: a tag Git core-vX.Y.Z publica a imagem X.Y.Z.',
      }}
      actionBar={{ kind: 'create', href: RELEASES_HREF }}
      contentClassName={contentClassName}
      submitLabel="Registrar"
      pendingLabel="Registrando…"
      onSubmit={async (value) => {
        const result = await action(value);
        if (!result.ok) {
          return result.issues.length > 0 ? result.issues : [{ path: [], message: result.message }];
        }
        // `value` já passou pelo schema: a tag vem aparada.
        router.push(`${RELEASES_HREF}?registrada=${encodeURIComponent(value.tag)}`);
        router.refresh();
      }}
    />
  );
}
