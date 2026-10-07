import { notFound } from 'next/navigation';

import { getEnv } from '@/env.ts';

export const dynamic = 'force-dynamic';

// Gatilho do E2E da tela de erro (#77): só com E2E_ERROR_ROUTE (compose local) lança uma
// exceção de propósito; sem a variável, que é o padrão, a página não existe.
export default function ErrorTriggerPage(): never {
  if (!getEnv().E2E_ERROR_ROUTE) notFound();
  throw new Error('Erro provocado pelo E2E da tela de erro.');
}
