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
      <NavigationIndicator />
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <nav aria-label="Principal" className="flex items-center gap-6">
            <span className="font-semibold">Orakel Backoffice</span>
            <Link href="/sites" className="text-sm underline-offset-4 hover:underline">
              Sites
            </Link>
          </nav>
          <p className="text-sm text-muted-foreground">
            {actor.value.email} · {actor.value.roles.join(', ')}
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
