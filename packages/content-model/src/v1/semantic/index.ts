import { fail, ok, type Issue, type Result } from '../../result.ts';
import type { Content, SiteConfig } from '../entities/index.ts';
import { RESOURCES, type Resources } from '../resources.ts';
import type { SnapshotLine } from '../snapshot.ts';
import { SCHEMA_VERSION } from '../version.ts';
import { checkContentReferences, checkReferences } from './rules/references.ts';
import { assembleSnapshot } from './rules/snapshot-structure.ts';
import {
  checkConfigResources,
  checkContentResources,
  checkMediaResources,
} from './rules/supported-resources.ts';
import { checkUniqueBlockN } from './rules/unique-block-n.ts';
import { checkUniqueSlugs } from './rules/unique-slugs.ts';
import type { ReferenceContext, Snapshot } from './types.ts';

// Validação semântica: regras além do schema. Recebe dados já validados pelo schema e
// devolve todos os problemas de uma vez, nunca lança por erro de conteúdo. `resources`
// são os da release registrada para o site; o padrão é o da v1 no código atual.

export type { ReferenceContext, Snapshot } from './types.ts';

function assertV1(resources: Resources): void {
  if (resources.schemaVersion !== SCHEMA_VERSION) {
    // Chamar a v1 com recursos de outra versão é bug de quem chama, não erro de conteúdo.
    throw new Error(
      `Recursos da versão ${resources.schemaVersion} passados à validação da v${SCHEMA_VERSION}`,
    );
  }
}

const result = <T>(value: T, issues: Issue[]): Result<T> =>
  issues.length > 0 ? fail(issues) : ok(value);

/** Configuração de um site contra os recursos da release dele. */
export function validateSiteConfig(
  config: SiteConfig,
  resources: Resources = RESOURCES,
): Result<SiteConfig> {
  assertV1(resources);
  return result(config, checkConfigResources(config, resources));
}

/**
 * Um conteúdo isolado, como na aprovação do Backoffice: referências, `n` único e tipos
 * de bloco suportados. Slug único é conferido no banco, junto com os demais conteúdos.
 */
export function validateContent(
  content: Content,
  context: ReferenceContext,
  resources: Resources = RESOURCES,
): Result<Content> {
  assertV1(resources);
  return result(content, [
    ...checkContentReferences(content, context),
    ...checkUniqueBlockN(content),
    ...checkContentResources(content, resources),
  ]);
}

/** Snapshot inteiro de um site, como o build o recebe da API de exportação. */
export function validateSnapshot(
  lines: readonly SnapshotLine[],
  resources: Resources = RESOURCES,
): Result<Snapshot> {
  assertV1(resources);
  const assembled = assembleSnapshot(lines);
  if (!assembled.ok) return assembled;
  const snapshot = assembled.value;

  return result(snapshot, [
    ...checkConfigResources(snapshot.config, resources, ['config']),
    ...checkReferences(snapshot),
    ...checkUniqueSlugs(snapshot),
    ...snapshot.contents.flatMap((content, i) => [
      ...checkUniqueBlockN(content, ['contents', i]),
      ...checkContentResources(content, resources, ['contents', i]),
    ]),
    ...snapshot.media.flatMap((media, i) => checkMediaResources(media, resources, ['media', i])),
  ]);
}
