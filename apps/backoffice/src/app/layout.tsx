import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

import { MotionProvider } from '@/components/ui/MotionProvider';
import { parseThemeMode, THEME_COOKIE, THEME_SCRIPT } from '@/configs/theme.config';
import { cn } from '@/lib/utils';

import './globals.css';

// Inter do Ecme (#202), auto-hospedada: o .woff2 variável (100 a 900) é o mesmo do tema
// exemplo-a do @orakel/tokens, copiado com a licença OFL. Sem rede no build nem requisição ao
// Google em tempo de execução; o globals.css usa a variável no --font-sans.
const inter = localFont({
  src: './fonts/inter.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  // As páginas declaram só a área ("Sites"); as do site ganham o nome dele no layout do site.
  title: { default: 'Orakel Backoffice', template: '%s · Orakel Backoffice' },
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Tema (#203): com cookie, a classe já vem no HTML do servidor; sem ele, o script do <head>
  // a põe pela preferência do sistema antes da primeira pintura. Como o script muda a classe
  // antes da hidratação, o <html> suprime o aviso de diferença (só dos atributos dele).
  const mode = parseThemeMode((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="pt-BR" className={cn(inter.variable, mode)} suppressHydrationWarning>
      {mode === undefined && (
        <head>
          <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        </head>
      )}
      <body className="min-h-screen antialiased">
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
