'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

import { StatusScreen } from '@/components/status-screen';
import { buttonVariants } from '@/components/ui/button';

// Item inexistente num site que existe (#78): conteúdo, autor, versão… O link volta ao site.
// Site inexistente não chega aqui: o notFound() do layout do site cai no (admin)/not-found,
// com o link para Sites. O not-found não recebe params; o site vem da URL (useParams).
export default function SiteNotFound() {
  const { site } = useParams<{ site: string }>();
  return (
    <StatusScreen
      title="Página não encontrada"
      action={
        <Link href={`/sites/${site}`} className={buttonVariants({ variant: 'outline' })}>
          Ir para o site {site}
        </Link>
      }
    >
      O endereço não existe neste site ou o item foi removido.
    </StatusScreen>
  );
}
