// Documento DTCG → tokens planos, com aliases resolvidos e valores validados pelo tipo.
// Erros são agregados: um tema quebrado mostra todos os problemas de uma vez.
import {
  ALIAS,
  TOKEN_TYPES,
  VALUE_SCHEMAS,
  type Issue,
  type ResolvedToken,
  type Result,
  type TokenType,
} from './schema.ts';

type RawToken = { path: string; type: TokenType | undefined; raw: unknown };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isTokenType = (value: unknown): value is TokenType =>
  TOKEN_TYPES.includes(value as TokenType);

/** Caminha pelos grupos; `$type` de um grupo vale para os tokens abaixo dele. */
export function flatten(document: unknown, issues: Issue[]): Map<string, RawToken> {
  const tokens = new Map<string, RawToken>();

  function walk(node: Record<string, unknown>, path: string[], inherited: TokenType | undefined) {
    let type = inherited;
    if ('$type' in node) {
      if (isTokenType(node.$type)) type = node.$type;
      else
        issues.push({
          code: 'type.unsupported',
          message: `$type "${String(node.$type)}" não é suportado (use ${TOKEN_TYPES.join(', ')})`,
          path: path.join('.') || '$type',
        });
    }
    if ('$value' in node) {
      tokens.set(path.join('.'), { path: path.join('.'), type, raw: node.$value });
      return;
    }
    for (const [name, child] of Object.entries(node)) {
      if (name.startsWith('$')) continue;
      const childPath = [...path, name];
      if (/[.{}]/.test(name)) {
        issues.push({
          code: 'name.invalid',
          message: 'Nomes não podem ter ".", "{" nem "}"',
          path: childPath.join('.'),
        });
        continue;
      }
      if (!isObject(child)) {
        issues.push({
          code: 'structure.invalid',
          message: 'Esperado um grupo ou um token ({ "$value": … })',
          path: childPath.join('.'),
        });
        continue;
      }
      walk(child, childPath, type);
    }
  }

  if (isObject(document)) walk(document, [], undefined);
  else issues.push({ code: 'structure.invalid', message: 'O tema deve ser um objeto', path: '' });
  return tokens;
}

/** Resolve aliases (valor inteiro ou campo de sombra) e valida cada valor pelo tipo. */
export function resolveTokens(document: unknown): Result<Map<string, ResolvedToken>> {
  const issues: Issue[] = [];
  const raw = flatten(document, issues);
  const resolved = new Map<string, ResolvedToken | null>();

  function resolveAlias(
    target: string,
    from: string,
    stack: string[],
  ): ResolvedToken | null | undefined {
    if (!raw.has(target)) {
      issues.push({
        code: 'alias.missing',
        message: `Alias para token inexistente {${target}}`,
        path: from,
      });
      return null;
    }
    if (stack.includes(target)) {
      issues.push({
        code: 'alias.cycle',
        message: `Ciclo de aliases: ${[...stack, target].join(' → ')}`,
        path: from,
      });
      return null;
    }
    return resolve(target, stack);
  }

  function resolve(path: string, stack: string[] = []): ResolvedToken | null | undefined {
    if (resolved.has(path)) return resolved.get(path);
    const token = raw.get(path);
    if (!token) return undefined;
    const nextStack = [...stack, path];

    let type = token.type;
    let value: unknown = token.raw;

    const alias = typeof value === 'string' ? ALIAS.exec(value) : null;
    if (alias?.[1] !== undefined) {
      const target = resolveAlias(alias[1], path, nextStack);
      if (!target) return remember(path, null);
      if (type !== undefined && type !== target.type) {
        issues.push({
          code: 'alias.type-mismatch',
          message: `Token do tipo ${type} aponta para {${alias[1]}}, do tipo ${target.type}`,
          path,
        });
        return remember(path, null);
      }
      type = target.type;
      value = target.value;
    } else if (type === 'shadow') {
      value = resolveShadowFields(value, path, nextStack);
      if (value === null) return remember(path, null);
    }

    if (type === undefined) {
      issues.push({
        code: 'type.missing',
        message: 'Token sem $type (no token ou num grupo acima)',
        path,
      });
      return remember(path, null);
    }

    const parsed = VALUE_SCHEMAS[type].safeParse(value);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push({
          code: `schema.${issue.code}`,
          message: `${type}: ${issue.message}`,
          path: [path, ...issue.path.map(String)].join('.'),
        });
      }
      return remember(path, null);
    }
    return remember(path, { path, type, value: parsed.data } as ResolvedToken);
  }

  function resolveShadowFields(value: unknown, path: string, stack: string[]): unknown {
    const layers: unknown[] = Array.isArray(value) ? (value as unknown[]) : [value];
    let failed = false;
    const out = layers.map((layer) => {
      if (!isObject(layer)) return layer;
      return Object.fromEntries(
        Object.entries(layer).map(([field, fieldValue]) => {
          const alias = typeof fieldValue === 'string' ? ALIAS.exec(fieldValue) : null;
          if (alias?.[1] === undefined) return [field, fieldValue];
          const target = resolveAlias(alias[1], `${path}.${field}`, stack);
          if (!target) failed = true;
          return [field, target?.value];
        }),
      );
    });
    if (failed) return null;
    return Array.isArray(value) ? out : out[0];
  }

  function remember(path: string, token: ResolvedToken | null) {
    resolved.set(path, token);
    return token;
  }

  const tokens = new Map<string, ResolvedToken>();
  for (const path of raw.keys()) {
    const token = resolve(path);
    if (token) tokens.set(path, token);
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: tokens };
}
