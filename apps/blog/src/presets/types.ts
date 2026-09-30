import type { PageContext } from '../data/site-source.ts';
import type { PageModel } from '../routing/resolve.ts';

/** Props de um preset: o contexto e o modelo do tipo de página que ele atende. */
export type PresetProps<T extends PageModel['type']> = {
  ctx: PageContext;
  model: Extract<PageModel, { type: T }>;
};
