import SpaceSignBoard from '@/assets/svg/SpaceSignBoard';
import { StatusScreen } from '@/components/shared/StatusScreen';
import ButtonLink from '@/components/ui/Button/ButtonLink';
import type { Role } from '@/db/schema/index.ts';
import { PERMISSIONS, type Action } from '@/domain/access/rbac.ts';
import type { SiteSummary } from '@/domain/sites/sites.ts';

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
  return roles.length === 0
    ? `${ACTION_LABEL[action]} não é permitido a nenhum papel.`
    : `${ACTION_LABEL[action]} exige o papel ${OR.format(roles)}.`;
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
      illustration={<SpaceSignBoard height={280} width={280} />}
      action={<ButtonLink href={back.href}>{back.label}</ButtonLink>}
    >
      {/* Anunciado como o alerta que esta tela substitui: a aba mantém o título da página. */}
      <p role="alert">{forbiddenReason(action)}</p>
    </StatusScreen>
  );
}

/** Saídas da tela de permissão: o site, citado pelo nome, e a lista de sites. */
export const backToSite = (site: Pick<SiteSummary, 'id' | 'name'>) => ({
  href: `/sites/${site.id}`,
  label: `Ir para o site ${site.name}`,
});

export const backToSites = { href: '/sites', label: 'Ir para a lista de sites' };

/** Tela de permissão sem `site.read`: não há site para onde voltar. */
export const noRead = <ForbiddenScreen action="site.read" back={backToSites} />;
