'use client';

import type { Issue } from '@orakel/content-model';
import { useId, useState } from 'react';
import * as z from 'zod';

import { SchemaForm, type FieldProps, type SchemaFormIssue } from '@/components/forms/SchemaForm';
import type { FormActionResult } from '@/components/shared/actionResult.ts';
import { CONTENT_STATUS_LABEL } from '@/components/shared/siteLabels.ts';
import { SECTION_HINT_CLASS, SECTION_TITLE_CLASS } from '@/components/shared/sectionText.ts';
import Alert from '@/components/ui/Alert';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import type { ContentListItem } from '@/domain/content/contents.ts';

// Painel da tela de revisão (#75), ao lado da visualização a partir de `xl` e abaixo dela antes
// (#373): erros de validação da release, checklist e aprovação. A página decide permissão e estado no servidor e passa os itens do
// checklist (REVIEW_CHECKLIST, do domínio, que não pode ir para o bundle do cliente); o
// domínio confere tudo de novo ao aprovar. Visual do Ecme (#277): o conteúdo em `Card`s, com as
// cores do `@theme`; o `<aside>` fica por fora para manter o landmark. O checklist tem cartão
// próprio, com "Aprovar" no rodapé dele (#333). As duas seções são seções da tela (`h2`, como
// "Dados" e "Blocos" na versão, #372); o `<aside>` tem o nome por `aria-label`, sem `h2` oculto,
// e a prévia em nova aba é ação do cabeçalho da página. Os problemas de validação e o aviso de
// bloqueio ficam no `Alert` de erro do Ecme (#444), sem `role="alert"`: chegam no carregamento,
// não são retorno de uma ação. Abaixo do checklist, "Devolver ao editor" (#598) em cartão próprio,
// com o comentário obrigatório: não depende do checklist nem da validação, porque devolver não
// leva nada ao site. Decidida a versão (aprovada ou devolvida), os dois formulários saem.

export type ChecklistItem = { key: string; label: string };

type Action<A> = (arg: A) => Promise<FormActionResult<SchemaFormIssue>>;

const returnSchema = z.object({
  comment: z.string().trim().min(1, 'Escreva o que o editor precisa corrigir.'),
});

/** Comentário da devolução em várias linhas, no `Input` de texto longo do Ecme. */
function CommentField({ id, ref, value, onChange, invalid, required, describedBy }: FieldProps) {
  return (
    <Input
      textArea
      id={id}
      // O `ref` do Input do Ecme também admite um componente; o foco do erro só precisa do DOM.
      ref={(element) => ref(element instanceof HTMLElement ? element : null)}
      rows={4}
      aria-invalid={invalid}
      aria-required={required || undefined}
      aria-describedby={describedBy}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

const RETURN_FIELDS = { comment: (props: FieldProps) => <CommentField {...props} /> };

function checklistSchema(items: readonly ChecklistItem[]) {
  return z.object(
    Object.fromEntries(
      items.map((item) => [
        item.key,
        z.boolean().refine((checked) => checked, 'Marque este item para aprovar.'),
      ]),
    ),
  );
}

export function ReviewPanel({
  version,
  status,
  issues,
  checklist,
  canApprove,
  approve,
  giveBack,
}: {
  version: number;
  status: ContentListItem['status'];
  /** Problemas de validação da versão contra a release do site (`reviewIssues`). */
  issues: readonly Pick<Issue, 'message'>[];
  checklist: readonly ChecklistItem[];
  /** `content.publish` (aprovar e devolver), decidido no servidor. */
  canApprove: boolean;
  approve: Action<string[]>;
  /** Devolve ao editor com o comentário (`returnVersion`). */
  giveBack: Action<string>;
}) {
  const id = useId();
  // Decidida nesta tela: os formulários saem e a confirmação vai para o toast (pelo SchemaForm).
  const [decided, setDecided] = useState(false);
  const inReview = status === 'em_revisao';
  const open = canApprove && inReview && !decided;
  const blocked = issues.length > 0;
  const checklistTitle = (
    <h2 id={`${id}-checklist`} className={SECTION_TITLE_CLASS}>
      Checklist
    </h2>
  );

  return (
    <aside aria-label={`Revisão da versão ${version}`} className="flex flex-col gap-4">
      <Card>
        <section aria-labelledby={`${id}-issues`} className="space-y-2">
          <h2 id={`${id}-issues`} className={SECTION_TITLE_CLASS}>
            Validação da release
          </h2>
          {blocked ? (
            <Alert type="danger" showIcon duration={0}>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {issues.map((issue) => (
                  <li key={issue.message}>{issue.message}</li>
                ))}
              </ul>
            </Alert>
          ) : (
            <p className={SECTION_HINT_CLASS}>Nenhum problema de validação.</p>
          )}
        </section>
      </Card>

      <section aria-labelledby={`${id}-checklist`}>
        {open ? (
          <SchemaForm
            schema={checklistSchema(checklist)}
            defaultValues={Object.fromEntries(checklist.map((item) => [item.key, false]))}
            labels={Object.fromEntries(checklist.map((item) => [item.key, item.label]))}
            card={{
              intro: (
                <>
                  {checklistTitle}
                  {blocked && (
                    <Alert type="danger" showIcon duration={0}>
                      <p id={`${id}-blocked`} className="text-sm">
                        Corrija os problemas de validação antes de aprovar.
                      </p>
                    </Alert>
                  )}
                </>
              ),
            }}
            submitLabel="Aprovar"
            pendingLabel="Aprovando…"
            submitDisabled={blocked}
            submitDescribedBy={blocked ? `${id}-blocked` : undefined}
            onSubmit={async (value) => {
              const marked = Object.entries(value)
                .filter(([, checked]) => checked === true)
                .map(([key]) => key);
              const outcome = await approve(marked);
              if (!outcome.ok) return outcome.issues;
              setDecided(true);
              return { success: outcome.message };
            }}
          />
        ) : (
          <Card bodyClass="space-y-3">
            {checklistTitle}
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {checklist.map((item) => (
                <li key={item.key}>{item.label}</li>
              ))}
            </ul>
            {!inReview && !decided && (
              <p className={SECTION_HINT_CLASS}>
                Esta versão está {CONTENT_STATUS_LABEL[status].toLowerCase()}: só uma versão em
                revisão pode ser aprovada.
              </p>
            )}
          </Card>
        )}
      </section>

      {open && (
        <section aria-labelledby={`${id}-return`}>
          <SchemaForm
            schema={returnSchema}
            defaultValues={{ comment: '' }}
            labels={{ comment: 'O que corrigir' }}
            fields={RETURN_FIELDS}
            card={{
              intro: (
                <>
                  <h2 id={`${id}-return`} className={SECTION_TITLE_CLASS}>
                    Devolver ao editor
                  </h2>
                  <p className={SECTION_HINT_CLASS}>
                    A versão volta a rascunho e sai da fila; o comentário aparece para quem edita.
                  </p>
                </>
              ),
            }}
            submitLabel="Devolver ao editor"
            pendingLabel="Devolvendo…"
            onSubmit={async ({ comment }) => {
              const outcome = await giveBack(comment);
              if (!outcome.ok) return outcome.issues;
              setDecided(true);
              return { success: outcome.message };
            }}
          />
        </section>
      )}
    </aside>
  );
}
