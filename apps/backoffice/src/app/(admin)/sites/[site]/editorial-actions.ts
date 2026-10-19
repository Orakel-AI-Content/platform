'use server';

import type { Issue, Result } from '@orakel/content-model';
import type { Author, Menu, Taxonomy } from '@orakel/content-model/v1';
import { revalidatePath } from 'next/cache';

import { currentActor } from '@/auth/request-actor.ts';
import type { EntityFormResult } from '@/components/editorial/EntityForms';
import { getDb, type Executor } from '@/db/client.ts';
import type { Actor } from '@/domain/access/rbac.ts';
import { createAuthor, updateAuthor } from '@/domain/content/authors.ts';
import { createMenu, updateMenu } from '@/domain/content/menus.ts';
import { createTaxonomy, updateTaxonomy } from '@/domain/content/taxonomies.ts';
import { updateInstitutionalTexts, type InstitutionalTexts } from '@/domain/sites/sites.ts';

// Ações das telas de autores, taxonomias, menus e textos institucionais: validação,
// permissão (content.write) e unicidade ficam no domínio; aqui só a tradução do Result.
// O valor chega do formulário sem tipo garantido; o domínio valida pelo schema.

type Path = (string | number)[];

/** Issues do domínio no formato do formulário; `strip` tira o prefixo que o form não tem. */
function refused(issues: readonly Issue[], strip: Path = []): EntityFormResult {
  return {
    ok: false,
    message: 'Não foi possível salvar.',
    issues: issues.map((issue) => {
      const path = issue.path.map((key) => (typeof key === 'number' ? key : String(key)));
      const prefixed = strip.every((key, index) => path[index] === key);
      return { path: prefixed ? path.slice(strip.length) : path, message: issue.message };
    }),
  };
}

async function run<T>(
  write: (tx: Executor, actor: Actor) => Promise<Result<T>>,
  revalidate: string,
  success: string,
  strip?: Path,
): Promise<EntityFormResult> {
  const actor = await currentActor();
  if (!actor.ok) return { ok: false, message: 'Sessão inválida; entre de novo.', issues: [] };
  const result = await getDb().db.transaction((tx) => write(tx, actor.value));
  if (!result.ok) return refused(result.issues, strip);
  revalidatePath(revalidate);
  return { ok: true, message: success };
}

const listPath = (siteId: string, segment: string) => `/sites/${siteId}/${segment}`;

export async function createAuthorAction(siteId: string, value: unknown) {
  return run(
    (tx, actor) => createAuthor(tx, actor, siteId, value as Omit<Author, 'id'>),
    listPath(siteId, 'autores'),
    'Autor criado.',
  );
}

export async function updateAuthorAction(siteId: string, id: number, value: unknown) {
  return run(
    (tx, actor) => updateAuthor(tx, actor, siteId, id, value as Omit<Author, 'id'>),
    listPath(siteId, 'autores'),
    'Autor salvo.',
  );
}

export async function createTaxonomyAction(siteId: string, value: unknown) {
  return run(
    (tx, actor) => createTaxonomy(tx, actor, siteId, value as Omit<Taxonomy, 'id'>),
    listPath(siteId, 'taxonomias'),
    'Taxonomia criada.',
  );
}

export async function updateTaxonomyAction(siteId: string, id: number, value: unknown) {
  return run(
    (tx, actor) => updateTaxonomy(tx, actor, siteId, id, value as Omit<Taxonomy, 'id'>),
    listPath(siteId, 'taxonomias'),
    'Taxonomia salva.',
  );
}

export async function createMenuAction(siteId: string, value: unknown) {
  return run(
    (tx, actor) => createMenu(tx, actor, siteId, value as Omit<Menu, 'id'>),
    listPath(siteId, 'menus'),
    'Menu criado.',
  );
}

export async function updateMenuAction(siteId: string, id: number, value: unknown) {
  return run(
    (tx, actor) => updateMenu(tx, actor, siteId, id, value as Omit<Menu, 'id'>),
    listPath(siteId, 'menus'),
    'Menu salvo.',
  );
}

/** Grava a versão nova da configuração só com os textos trocados. */
export async function updateInstitutionalTextsAction(siteId: string, value: unknown) {
  return run(
    (tx, actor) => updateInstitutionalTexts(tx, actor, siteId, value as InstitutionalTexts),
    listPath(siteId, 'institucionais'),
    'Textos salvos.',
    ['institutionalTexts'],
  );
}
