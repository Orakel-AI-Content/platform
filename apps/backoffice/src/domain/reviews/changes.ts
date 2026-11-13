import type { Block } from '@orakel/content-model/v1';

import type { ContentData } from '../../db/schema/index.ts';

// O que mudou entre duas versões de um conteúdo (#768): diff estrutural, sem lib de diff. Os
// metadados são comparados campo a campo; os blocos, pareados pelo `n` (único na versão). Puro:
// sem banco nem React, para a revisão e para os testes.

/** Metadados comparados, na ordem em que a revisão os mostra. */
export const CHANGE_FIELDS = [
  'title',
  'description',
  'taxonomyIds',
  'coverMediaId',
  'publishedAt',
  'seoTitle',
  'seoDescription',
  'seoCanonical',
] as const;

export type ChangeField = (typeof CHANGE_FIELDS)[number];

/** Valor de um metadado; `undefined` é o campo vazio. */
export type FieldValue = string | number | readonly number[] | undefined;

export type FieldChange = { field: ChangeField; before: FieldValue; after: FieldValue };

export type BlockChange =
  | { n: number; kind: 'adicionado'; after: Block }
  | { n: number; kind: 'removido'; before: Block }
  | { n: number; kind: 'alterado'; before: Block; after: Block };

export type VersionChanges = { fields: FieldChange[]; blocks: BlockChange[] };

const FIELD_VALUE: Record<ChangeField, (data: ContentData) => FieldValue> = {
  title: (data) => data.title,
  description: (data) => data.description,
  // A ordem das taxonomias não muda o conteúdo: compara o conjunto.
  taxonomyIds: (data) => [...data.taxonomyIds].sort((a, b) => a - b),
  coverMediaId: (data) => data.coverMediaId,
  publishedAt: (data) => data.publishedAt,
  seoTitle: (data) => data.seo?.title,
  seoDescription: (data) => data.seo?.description,
  seoCanonical: (data) => data.seo?.canonical,
};

/** Igualdade estrutural de valores JSON (o que `content_versions.data` guarda). */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => sameJson(item, b[index]))
    );
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  // Chave com `undefined` é chave ausente, como no JSON gravado.
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => sameJson(left[key], right[key]));
}

/**
 * Campos e blocos que mudaram de `before` para `after`. Blocos iguais ficam de fora; os que
 * mudaram vêm em ordem de `n`. Dados iguais devolvem as duas listas vazias.
 */
export function compareVersions(before: ContentData, after: ContentData): VersionChanges {
  const fields = CHANGE_FIELDS.flatMap((field): FieldChange[] => {
    const old = FIELD_VALUE[field](before);
    const now = FIELD_VALUE[field](after);
    return sameJson(old, now) ? [] : [{ field, before: old, after: now }];
  });

  const oldBlocks = new Map(before.blocks.map((block) => [block.n, block]));
  const newBlocks = new Map(after.blocks.map((block) => [block.n, block]));
  const numbers = [...new Set([...oldBlocks.keys(), ...newBlocks.keys()])].sort((a, b) => a - b);
  const blocks = numbers.flatMap((n): BlockChange[] => {
    const old = oldBlocks.get(n);
    const now = newBlocks.get(n);
    if (old === undefined) return now === undefined ? [] : [{ n, kind: 'adicionado', after: now }];
    if (now === undefined) return [{ n, kind: 'removido', before: old }];
    return sameJson(old, now) ? [] : [{ n, kind: 'alterado', before: old, after: now }];
  });

  return { fields, blocks };
}
