// _redirects do Workers Static Assets (`05`, seção 3.2): estáticos e dinâmicos têm limites
// próprios; acima deles o build falha (permanente) e o uso volta para o result.json, para o
// alerta de 75% no backoffice.
import type { Redirect, Snapshot } from '@orakel/content-model/v1';
import { REDIRECT_LIMITS } from '../policy.ts';
import { fail, ok, type Issue, type Result } from '../result.ts';

export const REDIRECTS_PATH = '/_redirects';

export type RedirectUsage = {
  static: number;
  dynamic: number;
  limits: { static: number; dynamic: number };
  /** Algum dos dois passou de 75% do limite. */
  alert: boolean;
};

/** Dinâmico: a origem usa splat (`*`) ou placeholder (`:nome`). */
export function isDynamicRedirect(redirect: Pick<Redirect, 'from'>): boolean {
  return /\*|\/:[A-Za-z]/.test(redirect.from);
}

export function redirectUsage(redirects: readonly Redirect[]): RedirectUsage {
  const dynamic = redirects.filter(isDynamicRedirect).length;
  const staticCount = redirects.length - dynamic;
  const { alertRatio } = REDIRECT_LIMITS;
  return {
    static: staticCount,
    dynamic,
    limits: { static: REDIRECT_LIMITS.static, dynamic: REDIRECT_LIMITS.dynamic },
    alert:
      staticCount >= REDIRECT_LIMITS.static * alertRatio ||
      dynamic >= REDIRECT_LIMITS.dynamic * alertRatio,
  };
}

export function redirectsFile(
  snapshot: Pick<Snapshot, 'redirects'>,
): Result<{ path: string; content: string; usage: RedirectUsage }> {
  const usage = redirectUsage(snapshot.redirects);
  const issues: Issue[] = [];
  for (const kind of ['static', 'dynamic'] as const) {
    if (usage[kind] > usage.limits[kind]) {
      issues.push({
        code: `redirect.limit-${kind}`,
        message: `${usage[kind]} redirects ${kind === 'static' ? 'estáticos' : 'dinâmicos'}; o limite do _redirects é ${usage.limits[kind]}`,
        path: ['redirects'],
      });
    }
  }
  if (issues.length > 0) return fail(issues);

  // Ordem estável (por ID): o mesmo snapshot gera o mesmo arquivo.
  const lines = [...snapshot.redirects]
    .sort((a, b) => a.id - b.id)
    .map((redirect) => `${redirect.from} ${redirect.to} ${redirect.status}\n`);
  return ok({ path: REDIRECTS_PATH, content: lines.join(''), usage });
}
