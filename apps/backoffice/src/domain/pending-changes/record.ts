import type { Executor } from '../../db/client.ts';
import { pendingChanges } from '../../db/schema/index.ts';
import { scheduleBuild } from '../builds/schedule.ts';

/** De onde vem a mudança (entidades que a API de exportação entrega a um site). */
export type PendingOrigin =
  | 'config'
  | 'content'
  | 'author'
  | 'taxonomy'
  | 'menu'
  | 'media'
  | 'redirect'
  | 'release'
  | 'platform';

/**
 * Tabelas cujas gravações vão para um site. Todo módulo de domínio que grava numa delas
 * precisa chamar `recordPendingChange` na mesma transação (teste de varredura).
 */
export const EXPORTED_TABLES = [
  'sites',
  'siteConfigs',
  'authors',
  'taxonomies',
  'menus',
  'media',
  'mediaVariants',
  'redirects',
  'contents',
  'contentVersions',
] as const;

/**
 * Registra, na transação da gravação, que o site tem uma mudança a publicar, e agenda o build
 * (12.0, L3): os dois entram ou saem juntos. O próximo build bem-sucedido baixa a mudança
 * pela lista de IDs do snapshot.
 */
export async function recordPendingChange(
  tx: Executor,
  siteId: string,
  origin: PendingOrigin,
  reference: string,
): Promise<number> {
  const [row] = await tx
    .insert(pendingChanges)
    .values({ siteId, origin, reference })
    .returning({ id: pendingChanges.id });
  if (row === undefined) throw new Error('Falha ao registrar a mudança pendente');
  await scheduleBuild(tx, siteId);
  return row.id;
}
