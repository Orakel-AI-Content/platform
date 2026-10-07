'use client';

import { ErrorScreen } from '@/components/error-screen';

import './globals.css';

// Falha no layout de (admin) ou no raiz (#77), ex.: banco fora do ar ao ler a sessão. Substitui
// o layout raiz inteiro, então traz o próprio <html>, o CSS e um cabeçalho estático: aqui não
// há sessão para mostrar quem está conectado.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">
        <title>Erro · Orakel Backoffice</title>
        <header className="border-b border-border">
          <div className="mx-auto flex max-w-6xl items-center px-6 py-3">
            <span className="font-semibold">Orakel Backoffice</span>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">
          <ErrorScreen digest={error.digest} retry={retry} />
        </main>
      </body>
    </html>
  );
}
