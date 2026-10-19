/**
 * Retorno de uma ação (Server Action ou validação local): a mensagem de sucesso vai para o toast
 * e a de erro para o `Alert` junto da ação (`ActionFeedback.tsx`). Sem `'use client'`, para a
 * Server Action importar o tipo. Os resultados de formulário estendem o lado do erro.
 */
export type ActionResult = { ok: true; message: string } | { ok: false; message: string };

/**
 * Retorno de formulário: o `ActionResult`, com a recusa do servidor no erro (`issues` com
 * `path` viram erro do campo; sem, vão para o resumo do `SchemaForm`).
 */
export type FormActionResult<I> =
  Extract<ActionResult, { ok: true }> | (Extract<ActionResult, { ok: false }> & { issues: I[] });
