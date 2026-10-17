import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getEnv } from '@/env.ts';

import { Showcase } from './showcase.tsx';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Teste de componentes' };

// Vitrine dos componentes do Ecme (#205; workspace#45): onde o E2E audita cada componente
// portado com axe e teclado, nos dois temas. Mesmo gate do teste-de-erro: só com
// E2E_ERROR_ROUTE (compose local); sem a variável, que é o padrão, a página não existe. Cada
// Task de componente acrescenta a sua seção; a remoção fica para a limpeza do épico (#52).
export default function ComponentsShowcasePage() {
  if (!getEnv().E2E_ERROR_ROUTE) notFound();
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Teste de componentes</h1>
      <Showcase />
    </div>
  );
}
