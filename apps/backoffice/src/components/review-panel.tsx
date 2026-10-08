'use client';

import type { Issue } from '@orakel/content-model';
import { useId, useState } from 'react';
import * as z from 'zod';

import { SchemaForm, type SchemaFormIssue } from '@/components/forms/schema-form';
import { CONTENT_STATUS_LABEL } from '@/components/site-labels.ts';
import type { ContentListItem } from '@/domain/content/contents.ts';

// Painel da tela de revisão (#75), ao lado da visualização: erros de validação da release,
// checklist e aprovação. A página decide permissão e estado no servidor e passa os itens do
// checklist (REVIEW_CHECKLIST, do domínio, que não pode ir para o bundle do cliente); o
// domínio confere tudo de novo ao aprovar.

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
    <aside aria-labelledby={`${id}-title`} className="space-y-6">
      <h2 id={`${id}-title`} className="sr-only">
        Revisão da versão {version}
      </h2>
      <p className="text-sm">
        <a
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-4"
        >
          Abrir a visualização em nova aba
        </a>
      </p>

      <section aria-labelledby={`${id}-issues`} className="space-y-2">
        <h3 id={`${id}-issues`} className="text-lg font-semibold">
          Validação da release
        </h3>
        {blocked ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
            {issues.map((issue) => (
              <li key={issue.message}>{issue.message}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum problema de validação.</p>
        )}
      </section>

      <section aria-labelledby={`${id}-checklist`} className="space-y-3">
        <h3 id={`${id}-checklist`} className="text-lg font-semibold">
          Checklist
        </h3>
        {canApprove && inReview && approved === null ? (
          <>
            {blocked && (
              <p id={`${id}-blocked`} className="text-sm text-destructive">
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
              <p className="text-sm text-muted-foreground">
                Esta versão está {CONTENT_STATUS_LABEL[status].toLowerCase()}: só uma versão em
                revisão pode ser aprovada.
              </p>
            )}
          </>
        )}
        <p role="status" className="text-sm text-muted-foreground">
          {approved}
        </p>
      </section>
    </aside>
  );
}
