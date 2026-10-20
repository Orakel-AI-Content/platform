import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getEnv } from '@/env.ts';

import { Showcase } from './showcase.tsx';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Teste de componentes' };

// Vitrine dos componentes do Ecme (#205; workspace#45): onde o E2E audita cada componente
// portado com axe e teclado, nos dois temas. Mesmo gate do teste-de-erro: só com
// E2E_ERROR_ROUTE (compose local); sem a variável, que é o padrão, a página não existe. Cada
// Task de componente acrescenta a sua seção. Fica depois da migração (#52): é o harness de axe e
// teclado dos componentes do Ecme, não visual antigo.
type SearchParams = { searchParams: Promise<{ 'pagina-link'?: string | string[] }> };

export default async function ComponentsShowcasePage({ searchParams }: SearchParams) {
  if (!getEnv().E2E_ERROR_ROUTE) notFound();
  // Página da Pagination em modo link (#214): vem da URL, para o E2E conferir a navegação sem
  // estado no cliente. Em `pagina-link`, porque o `pagina` é do DataTable (#215).
  const { 'pagina-link': pagina } = await searchParams;
  const linkPage = Number.parseInt(typeof pagina === 'string' ? pagina : '', 10);
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Teste de componentes</h1>
      <Showcase linkPage={Number.isNaN(linkPage) ? 1 : linkPage} />
    </div>
  );
}
