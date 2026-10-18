'use client';

import { useLayoutEffect } from 'react';

import { ErrorScreen } from '@/components/error-screen';
import { applyStoredTheme, THEME_COOKIE_SCRIPT } from '@/configs/theme.config';

import './globals.css';

// Falha no layout de (admin) ou no raiz (#77), ex.: banco fora do ar ao ler a sessão. Substitui
// o layout raiz inteiro, então traz o próprio <html>, o CSS e um cabeçalho estático: aqui não
// há sessão para mostrar quem está conectado. Sem o cookie no servidor, o tema escolhido vem do
// script do <head>, antes da primeira pintura (#283); o <html> suprime o aviso da classe.
// Montada no cliente (falha numa navegação), o React apaga a classe do <html> e não roda o
// script: o efeito de layout reaplica o tema antes da pintura.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useLayoutEffect(() => applyStoredTheme(), []);
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_COOKIE_SCRIPT }} />
        <title>Erro · Orakel Backoffice</title>
      </head>
      <body className="min-h-screen bg-gray-100 antialiased dark:bg-gray-950">
        <header className="border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="mx-auto flex max-w-6xl items-center px-6 py-3">
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              Orakel Backoffice
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">
          <ErrorScreen digest={error.digest} retry={retry} />
        </main>
      </body>
    </html>
  );
}
