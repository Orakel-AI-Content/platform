import Link from 'next/link';

import { StatusScreen } from '@/components/status-screen';
import { buttonVariants } from '@/components/ui/button';
import type { Role } from '@/db/schema/index.ts';
import { PERMISSIONS, type Action } from '@/domain/access/rbac.ts';

// Tela de permissão (#80): a ação negada e os papéis que a permitem, lidos da matriz do RBAC,
// com uma saída. Componente próprio, não o `forbidden()` do Next (experimental, sem a ação).

/** Ação do RBAC como a pessoa a lê, no começo da frase do motivo. */
export const ACTION_LABEL: Record<Action, string> = {
  'site.read': 'Ver os sites',
  'site.configure': 'Configurar os sites',
  'content.write': 'Editar conteúdo',
  'content.publish': 'Publicar conteúdo',
  'operations.run': 'Rodar operações',
  'release.promote': 'Promover releases',
};

const OR = new Intl.ListFormat('pt-BR', { type: 'disjunction' });

/** "Editar conteúdo exige o papel admin ou editor", com os papéis da matriz. */
export function forbiddenReason(
  action: Action,
  permissions: Record<Role, readonly Action[]> = PERMISSIONS,
): string {
  const roles = (Object.keys(permissions) as Role[]).filter((role) =>
    permissions[role].includes(action),
  );
  return `${ACTION_LABEL[action]} exige o papel ${OR.format(roles)}.`;
}

export function ForbiddenScreen({
  action,
  back,
}: {
  action: Action;
  /** O site, quando a pessoa pode vê-lo; senão, a lista de sites. */
  back: { href: string; label: string };
}) {
  return (
    <StatusScreen
      title="Sem permissão"
      action={
        <Link href={back.href} className={buttonVariants({ variant: 'outline' })}>
          {back.label}
        </Link>
      }
    >
      {forbiddenReason(action)}
    </StatusScreen>
  );
}

/** Saídas da tela de permissão: o site e a lista de sites. */
export const backToSite = (siteId: string) => ({
  href: `/sites/${siteId}`,
  label: `Ir para o site ${siteId}`,
});

export const backToSites = { href: '/sites', label: 'Ir para a lista de sites' };
