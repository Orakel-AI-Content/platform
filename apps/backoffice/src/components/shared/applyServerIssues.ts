import type { FieldValues, UseFormSetError } from 'react-hook-form';

/** Recusa do servidor (serializável; `path` aponta o campo, vazio é do formulário). */
export type ServerIssue = { path: readonly (string | number)[]; message: string };

/**
 * Aplica a recusa do servidor ao formulário: cada issue com `path` vira erro do campo, com
 * foco no primeiro. Devolve as mensagens sem `path`, que o chamador mostra no resumo.
 */
export function applyServerIssues(
  setError: UseFormSetError<FieldValues>,
  issues: readonly ServerIssue[],
): string[] {
  const top: string[] = [];
  let focused = false;
  for (const issue of issues) {
    if (issue.path.length === 0) {
      top.push(issue.message);
      continue;
    }
    setError(
      issue.path.join('.'),
      { type: 'server', message: issue.message },
      { shouldFocus: !focused },
    );
    focused = true;
  }
  return top;
}
