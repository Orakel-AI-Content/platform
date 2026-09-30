import type * as z from 'zod';

/** Problema encontrado numa validação. `path` aponta o campo, como no Zod. */
export type Issue = {
  /** `schema.<código do Zod>` para erros de schema; `semantic.<regra>` para a validação semântica. */
  code: string;
  message: string;
  path: PropertyKey[];
};

/** Erro esperado é valor, nunca exceção (ADR 0008 da raiz). */
export type Result<T> = { ok: true; value: T } | { ok: false; issues: Issue[] };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail<T = never>(issues: Issue[]): Result<T> {
  return { ok: false, issues };
}

export function issuesFromZod(error: z.ZodError): Issue[] {
  return error.issues.map((issue) => ({
    code: `schema.${issue.code}`,
    message: issue.message,
    path: issue.path,
  }));
}

/** `safeParse` no formato `Result`. */
export function parseWith<S extends z.ZodType>(schema: S, input: unknown): Result<z.output<S>> {
  const parsed = schema.safeParse(input);
  return parsed.success ? ok(parsed.data) : fail(issuesFromZod(parsed.error));
}
