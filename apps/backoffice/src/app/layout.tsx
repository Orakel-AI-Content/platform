import type { Metadata } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';

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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
