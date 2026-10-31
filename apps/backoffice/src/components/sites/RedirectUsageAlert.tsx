import type { RedirectUsage } from '@orakel/core/v1';

import { Alert } from '@/components/ui/Alert';

const number = new Intl.NumberFormat('pt-BR');

const KINDS = [
  { kind: 'static', label: 'Estáticos' },
  { kind: 'dynamic', label: 'Dinâmicos' },
] as const;

/**
 * Aviso de redirects perto do limite do `_redirects` (#487, workspace#20 R6), no `Alert` de
 * aviso do Ecme. Quem decide se aparece é o `alert` do `redirectUsage` do core; aqui só o uso
 * e o limite de cada tipo, como vieram dele.
 */
export function RedirectUsageAlert({ usage }: { usage: RedirectUsage }) {
  return (
    <Alert type="warning" showIcon duration={0} title="Redirecionamentos perto do limite">
      <p className="text-sm">
        Acima do limite do <code>_redirects</code>, a publicação do site falha.
      </p>
      <ul className="mt-1 text-sm">
        {KINDS.map(({ kind, label }) => (
          <li key={kind}>
            {label}: {number.format(usage[kind])} de {number.format(usage.limits[kind])}
          </li>
        ))}
      </ul>
    </Alert>
  );
}
