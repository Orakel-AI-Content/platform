import Link from 'next/link';
import type { ReactNode } from 'react';

import { currentActor } from '@/auth/request-actor.ts';
import { NavigationIndicator } from '@/components/navigation-indicator';

// Área autenticada: toda página daqui exige o JWT do Access e um usuário com papel. O
// domínio confere de novo a permissão de cada ação (nunca só aqui nem no proxy).
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const actor = await currentActor();
  if (!actor.ok) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-xl font-semibold">Sem acesso</h1>
        <p className="mt-2 text-muted-foreground">
          Sua identidade não tem acesso ao Backoffice. Peça a uma pessoa administradora.
        </p>
      </main>
    );
  }
  return (
    <div className="min-h-screen">
      {/* Primeira parada do Tab (WCAG 2.4.1): visível só com foco; leva o foco ao <main>. */}
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm"
      >
        Pular para o conteúdo
      </a>
      <NavigationIndicator />
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <nav aria-label="Principal" className="flex items-center gap-6">
            <Link href="/sites" className="font-semibold underline-offset-4 hover:underline">
              Orakel Backoffice
            </Link>
            <Link href="/sites" className="text-sm underline-offset-4 hover:underline">
              Sites
            </Link>
          </nav>
          <div className="flex items-center gap-4">
            <p className="text-sm text-muted-foreground">
              {actor.value.email} · {actor.value.roles.join(', ')}
            </p>
            {/* Rota do Cloudflare Access, fora do app: <a>, não <Link> (sem prefetch nem navegação
                pelo cliente). A regra do Next trata todo caminho "/" como página do app. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/cdn-cgi/access/logout" className="text-sm underline-offset-4 hover:underline">
              Sair
            </a>
          </div>
        </div>
      </header>
      {/* tabIndex -1: a âncora do skip link leva o foco até aqui, não só a rolagem. */}
      <main
        id="conteudo"
        tabIndex={-1}
        className="mx-auto max-w-6xl px-6 py-8 focus-visible:outline-none"
      >
        {children}
      </main>
    </div>
  );
}
