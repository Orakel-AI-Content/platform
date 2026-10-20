'use client';

import FileNotFound from '@/assets/svg/FileNotFound';
import { StatusScreen } from '@/components/shared/StatusScreen';
import ButtonLink from '@/components/ui/Button/ButtonLink';

import { useSite } from './site-context.tsx';

// Item inexistente num site que existe (#78): conteúdo, autor, versão… O link volta ao site.
// Site inexistente não chega aqui: o notFound() do layout do site cai no (admin)/not-found,
// com o link para Sites. O not-found não recebe params: o site vem do contexto do layout.
export default function SiteNotFound() {
  const site = useSite();
  return (
    <StatusScreen
      title="Página não encontrada"
      illustration={<FileNotFound height={280} width={280} />}
      action={<ButtonLink href={`/sites/${site.id}`}>Ir para o site {site.name}</ButtonLink>}
    >
      O endereço não existe neste site ou o item foi removido.
    </StatusScreen>
  );
}
