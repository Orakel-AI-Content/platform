import type { Issue } from '../../../result.ts';
import type { Content, Media, SiteConfig } from '../../entities/index.ts';
import { requiredImageWidths, type Resources } from '../../resources.ts';

const CODE = 'semantic.supported-resources';

/** Presets e variantes da configuração existem nos recursos da release do site. */
export function checkConfigResources(
  config: SiteConfig,
  resources: Resources,
  basePath: PropertyKey[] = [],
): Issue[] {
  const issues: Issue[] = [];
  const check = (group: 'presets' | 'variants', key: string, value: string) => {
    if (!(resources[group][key] ?? []).includes(value)) {
      issues.push({
        code: CODE,
        message: `${group === 'presets' ? 'Preset' : 'Variante'} "${value}" de ${key} não é suportado pela release do site`,
        path: [...basePath, group, key],
      });
    }
  };
  for (const [pageType, preset] of Object.entries(config.presets))
    check('presets', pageType, preset);
  for (const [component, variant] of Object.entries(config.variants))
    check('variants', component, variant);
  return issues;
}

/** Todo bloco do conteúdo é de um tipo que a release do site sabe renderizar. */
export function checkContentResources(
  content: Content,
  resources: Resources,
  basePath: PropertyKey[] = [],
): Issue[] {
  return content.blocks.flatMap((block, i) =>
    resources.blockTypes.includes(block.type)
      ? []
      : [
          {
            code: CODE,
            message: `Bloco "${block.type}" não é suportado pela release do site`,
            path: [...basePath, 'blocks', i, 'type'],
          },
        ],
  );
}

/**
 * A mídia tem as variantes do perfil de imagem (largura × formato) que cabem no original
 * (`requiredImageWidths`): nenhuma é ampliada. Variante faltando é falha permanente do
 * build; variantes extras são ignoradas.
 */
export function checkMediaResources(
  media: Media,
  resources: Resources,
  basePath: PropertyKey[] = [],
): Issue[] {
  const available = new Set(media.variants.map((variant) => `${variant.width}/${variant.format}`));
  const issues: Issue[] = [];
  for (const width of requiredImageWidths(media.width, resources)) {
    for (const format of resources.imageProfile.formats) {
      if (!available.has(`${width}/${format}`)) {
        issues.push({
          code: CODE,
          message: `Mídia ${media.id} sem a variante ${width}w ${format} do perfil de imagem`,
          path: [...basePath, 'variants'],
        });
      }
    }
  }
  return issues;
}
