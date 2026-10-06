import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createAuthorAction,
  createMenuAction,
  createTaxonomyAction,
  updateAuthorAction,
  updateInstitutionalTextsAction,
  updateMenuAction,
  updateTaxonomyAction,
} from './editorial-actions.ts';

// As actions só traduzem: sessão → recusa, Result do domínio → issues com path, sucesso →
// revalida a lista. Regras e permissão estão nos testes de contrato do domínio.

const mocks = vi.hoisted(() => ({
  currentActor: vi.fn(),
  revalidatePath: vi.fn(),
  write: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/auth/request-actor.ts', () => ({ currentActor: mocks.currentActor }));
vi.mock('@/db/client.ts', () => ({
  getDb: () => ({ db: { transaction: (fn: (tx: unknown) => unknown) => fn({}) } }),
}));
vi.mock('@/domain/content/authors.ts', () => ({
  createAuthor: mocks.write,
  updateAuthor: mocks.write,
}));
vi.mock('@/domain/content/taxonomies.ts', () => ({
  createTaxonomy: mocks.write,
  updateTaxonomy: mocks.write,
}));
vi.mock('@/domain/content/menus.ts', () => ({ createMenu: mocks.write, updateMenu: mocks.write }));
vi.mock('@/domain/sites/sites.ts', () => ({ updateInstitutionalTexts: mocks.write }));

const editor = { email: 'editor@orakel.local', roles: ['editor'] };

const actions = [
  ['autor (criar)', () => createAuthorAction('exemplo-a', {}), '/sites/exemplo-a/autores'],
  ['autor (editar)', () => updateAuthorAction('exemplo-a', 1, {}), '/sites/exemplo-a/autores'],
  ['taxonomia (criar)', () => createTaxonomyAction('exemplo-a', {}), '/sites/exemplo-a/taxonomias'],
  [
    'taxonomia (editar)',
    () => updateTaxonomyAction('exemplo-a', 1, {}),
    '/sites/exemplo-a/taxonomias',
  ],
  ['menu (criar)', () => createMenuAction('exemplo-a', {}), '/sites/exemplo-a/menus'],
  ['menu (editar)', () => updateMenuAction('exemplo-a', 1, {}), '/sites/exemplo-a/menus'],
  [
    'institucionais',
    () => updateInstitutionalTextsAction('exemplo-a', {}),
    '/sites/exemplo-a/institucionais',
  ],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentActor.mockResolvedValue({ ok: true, value: editor });
});

describe('ações das entidades editoriais', () => {
  it.each(actions)('%s: sem sessão não chama o domínio', async (_, action) => {
    mocks.currentActor.mockResolvedValue({ ok: false, issues: [] });

    expect(await action()).toMatchObject({ ok: false, issues: [] });
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(actions)('%s: recusa do domínio volta com path e não revalida', async (_, action) => {
    mocks.write.mockResolvedValue({
      ok: false,
      issues: [{ code: 'forbidden', message: 'Sem permissão para content.write', path: [] }],
    });

    expect(await action()).toEqual({
      ok: false,
      message: 'Não foi possível salvar.',
      issues: [{ path: [], message: 'Sem permissão para content.write' }],
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(actions)('%s: sucesso revalida a lista', async (_, action, path) => {
    mocks.write.mockResolvedValue({ ok: true, value: undefined });

    expect(await action()).toMatchObject({ ok: true });
    expect(mocks.write.mock.calls[0]?.slice(0, 3)).toEqual([{}, editor, 'exemplo-a']);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(path);
  });

  it('institucionais: o path volta sem o prefixo da configuração', async () => {
    mocks.write.mockResolvedValue({
      ok: false,
      issues: [
        { code: 'schema.custom', message: 'Inválido', path: ['institutionalTexts', 'about'] },
      ],
    });

    expect(await updateInstitutionalTextsAction('exemplo-a', {})).toMatchObject({
      issues: [{ path: ['about'], message: 'Inválido' }],
    });
  });

  it('slug repetido volta no campo slug', async () => {
    mocks.write.mockResolvedValue({
      ok: false,
      issues: [{ code: 'author.slug_exists', message: 'Já existe', path: ['slug'] }],
    });

    expect(await createAuthorAction('exemplo-a', {})).toMatchObject({
      issues: [{ path: ['slug'], message: 'Já existe' }],
    });
  });
});
