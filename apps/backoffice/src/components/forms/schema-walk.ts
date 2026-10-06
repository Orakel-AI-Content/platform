import type * as z from 'zod';

// Leitura de um schema Zod 4 para o gerador de formulários: o tipo de cada nó vem de
// `def.type`; opcional, nulo e padrão são desembrulhados. O que o gerador não sabe desenhar
// (união, registro, rich text) fica como `unknown`, para um campo registrado ou um aviso.

export type FieldNode =
  | { kind: 'string' }
  | { kind: 'number' }
  | { kind: 'boolean' }
  | { kind: 'enum'; options: string[] }
  | { kind: 'literal'; value: unknown }
  | { kind: 'object'; shape: Record<string, z.ZodType> }
  | { kind: 'array'; element: z.ZodType }
  | { kind: 'unknown'; type: string };

export type Described = { optional: boolean; node: FieldNode };

type Def = {
  type: string;
  innerType?: z.ZodType;
  entries?: Record<string, string>;
  values?: unknown[];
  shape?: Record<string, z.ZodType>;
  element?: z.ZodType;
};

const defOf = (schema: z.ZodType): Def => (schema as unknown as { def: Def }).def;

export function describe(schema: z.ZodType): Described {
  let current = schema;
  let optional = false;
  for (;;) {
    const def = defOf(current);
    if (
      (def.type === 'optional' || def.type === 'nullable' || def.type === 'default') &&
      def.innerType
    ) {
      optional = optional || def.type !== 'default';
      current = def.innerType;
      continue;
    }
    return { optional, node: nodeOf(def) };
  }
}

function nodeOf(def: Def): FieldNode {
  switch (def.type) {
    case 'string':
      return { kind: 'string' };
    case 'number':
      return { kind: 'number' };
    case 'boolean':
      return { kind: 'boolean' };
    case 'enum':
      return { kind: 'enum', options: Object.values(def.entries ?? {}) };
    case 'literal':
      return { kind: 'literal', value: def.values?.[0] };
    case 'object':
      return def.shape ? { kind: 'object', shape: def.shape } : { kind: 'unknown', type: def.type };
    case 'array':
      return def.element
        ? { kind: 'array', element: def.element }
        : { kind: 'unknown', type: def.type };
    default:
      return { kind: 'unknown', type: def.type };
  }
}

/** Caminho com índices trocados por `*`, para casar com o registro de campos. */
export function pattern(path: string): string {
  return path.replace(/\.\d+(?=\.|$)/g, '.*');
}

/** Valor inicial de um nó (lista nova de objetos, item adicionado). */
export function emptyValue(schema: z.ZodType): unknown {
  const { optional, node } = describe(schema);
  if (optional) return undefined;
  switch (node.kind) {
    case 'string':
      return '';
    case 'boolean':
      return false;
    case 'literal':
      return node.value;
    case 'enum':
      return node.options[0];
    case 'object':
      return Object.fromEntries(
        Object.entries(node.shape).map(([key, child]) => [key, emptyValue(child)]),
      );
    case 'array':
      return [];
    default:
      return undefined;
  }
}

/**
 * Prepara os valores do formulário para o schema: string opcional vazia vira `undefined`
 * (vale a regra do schema, não o `min(1)`), número vazio (`NaN`) também, e lista vazia em
 * campo opcional (rich text apagado, legenda sem texto) também.
 */
export function clean(schema: z.ZodType, value: unknown): unknown {
  const { optional, node } = describe(schema);
  if (node.kind === 'string' && optional && typeof value === 'string' && value.trim() === '') {
    return undefined;
  }
  if (node.kind === 'number' && typeof value === 'number' && Number.isNaN(value)) {
    return undefined;
  }
  if (node.kind === 'object' && value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(record).map(([key, child]) => {
        const childSchema = node.shape[key];
        return [key, childSchema ? clean(childSchema, child) : child];
      }),
    );
  }
  if (node.kind === 'array' && Array.isArray(value)) {
    if (optional && value.length === 0) return undefined;
    return value.map((item) => clean(node.element, item));
  }
  return value;
}
