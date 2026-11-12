// Próximo número do site-builder, sem banco nem GitHub: a tabela `releases` é a única fonte das
// tags, e quem chama passa todas elas (inclusive as descartadas, que nunca voltam a ser usadas).

/** Tipo de mudança: correção (patch), melhoria (minor) ou mudança grande (major). */
export const RELEASE_BUMPS = ['patch', 'minor', 'major'] as const;
export type ReleaseBump = (typeof RELEASE_BUMPS)[number];

/** Primeira versão, quando nenhuma release foi registrada. */
export const FIRST_VERSION = '0.1.0';

type Version = readonly [major: number, minor: number, patch: number];

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

function parse(tag: string): Version | undefined {
  const match = VERSION.exec(tag);
  if (match === null) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compare(a: Version, b: Version): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/**
 * Próxima versão X.Y.Z a partir da maior das `tags`, em ordem numérica (1.10.0 > 1.9.0).
 * Tags fora do formato são ignoradas; sem nenhuma válida, devolve {@link FIRST_VERSION}.
 */
export function nextVersion(tags: readonly string[], bump: ReleaseBump): string {
  let highest: Version | undefined;
  for (const tag of tags) {
    const version = parse(tag);
    if (version !== undefined && (highest === undefined || compare(version, highest) > 0)) {
      highest = version;
    }
  }
  if (highest === undefined) return FIRST_VERSION;

  const [major, minor, patch] = highest;
  switch (bump) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
  }
}
