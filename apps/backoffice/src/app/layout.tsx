import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  // As páginas declaram só a área ("Sites"); as do site ganham o nome dele no layout do site.
  title: { default: 'Orakel Backoffice', template: '%s · Orakel Backoffice' },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
