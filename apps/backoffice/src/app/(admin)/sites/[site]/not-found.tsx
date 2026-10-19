'use client';

import { useParams } from 'next/navigation';

import { StatusScreen } from '@/components/shared/StatusScreen';
import ButtonLink from '@/components/ui/Button/ButtonLink';

// Item inexistente num site que existe (#78): conteúdo, autor, versão… O link volta ao site.
// Site inexistente não chega aqui: o notFound() do layout do site cai no (admin)/not-found,
// com o link para Sites. O not-found não recebe params; o site vem da URL (useParams).
export default function SiteNotFound() {
  const { site } = useParams<{ site: string }>();
  return (
    <StatusScreen
      title="Página não encontrada"
      action={<ButtonLink href={`/sites/${site}`}>Ir para o site {site}</ButtonLink>}
    >
      O endereço não existe neste site ou o item foi removido.
    </StatusScreen>
  );
}
