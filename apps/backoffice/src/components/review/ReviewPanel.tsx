'use client';

import type { Issue } from '@orakel/content-model';
import { useId, useState } from 'react';
import * as z from 'zod';

import { SchemaForm, type SchemaFormIssue } from '@/components/forms/SchemaForm';
import { CONTENT_STATUS_LABEL } from '@/components/shared/siteLabels.ts';
import { SECTION_HINT_CLASS, SECTION_TITLE_CLASS } from '@/components/shared/sectionText.ts';
import Card from '@/components/ui/Card';
import type { ContentListItem } from '@/domain/content/contents.ts';

// Painel da tela de revisão (#75), ao lado da visualização: erros de validação da release,
// checklist e aprovação. A página decide permissão e estado no servidor e passa os itens do
// checklist (REVIEW_CHECKLIST, do domínio, que não pode ir para o bundle do cliente); o
// domínio confere tudo de novo ao aprovar. Visual do Ecme (#277): o conteúdo num `Card`, com as
// cores do `@theme`; o `<aside>` fica por fora para manter o landmark.

export type ChecklistItem = { key: string; label: string };

type ApproveOutcome = { ok: true; message: string } | { ok: false; issues: SchemaFormIssue[] };

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
  previewUrl,
  approve,
}: {
  version: number;
  status: ContentListItem['status'];
  /** Problemas de validação da versão contra a release do site (`reviewIssues`). */
  issues: readonly Pick<Issue, 'message'>[];
  checklist: readonly ChecklistItem[];
  /** `content.publish`, decidido no servidor. */
  canApprove: boolean;
  previewUrl: string;
  approve: (checklist: string[]) => Promise<ApproveOutcome>;
}) {
  const id = useId();
  const [approved, setApproved] = useState<string | null>(null);
  const inReview = status === 'em_revisao';
  const blocked = issues.length > 0;

  return (
    <aside aria-labelledby={`${id}-title`}>
      <Card bodyClass="space-y-6">
        <h2 id={`${id}-title`} className="sr-only">
          Revisão da versão {version}
        </h2>
        <p className="text-sm">
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-4 dark:text-primary-mild"
          >
            Abrir a visualização em nova aba
          </a>
        </p>

        <section aria-labelledby={`${id}-issues`} className="space-y-2">
          <h3 id={`${id}-issues`} className={SECTION_TITLE_CLASS}>
            Validação da release
          </h3>
          {blocked ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-error">
              {issues.map((issue) => (
                <li key={issue.message}>{issue.message}</li>
              ))}
            </ul>
          ) : (
            <p className={SECTION_HINT_CLASS}>Nenhum problema de validação.</p>
          )}
        </section>

        <section aria-labelledby={`${id}-checklist`} className="space-y-3">
          <h3 id={`${id}-checklist`} className={SECTION_TITLE_CLASS}>
            Checklist
          </h3>
          {canApprove && inReview && approved === null ? (
            <>
              {blocked && (
                <p id={`${id}-blocked`} className="text-sm text-error">
                  Corrija os problemas de validação antes de aprovar.
                </p>
              )}
              <SchemaForm
                schema={checklistSchema(checklist)}
                defaultValues={Object.fromEntries(checklist.map((item) => [item.key, false]))}
                labels={Object.fromEntries(checklist.map((item) => [item.key, item.label]))}
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
                  setApproved(outcome.message);
                }}
              />
            </>
          ) : (
            <>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {checklist.map((item) => (
                  <li key={item.key}>{item.label}</li>
                ))}
              </ul>
              {!inReview && approved === null && (
                <p className={SECTION_HINT_CLASS}>
                  Esta versão está {CONTENT_STATUS_LABEL[status].toLowerCase()}: só uma versão em
                  revisão pode ser aprovada.
                </p>
              )}
            </>
          )}
          <p role="status" className={SECTION_HINT_CLASS}>
            {approved}
          </p>
        </section>
      </Card>
    </aside>
  );
}
