// Coluna de resumo das telas de detalhe (site, conteúdo e revisão, #445): o cartão de perfil do
// `CustomerDetails` do Ecme. Sem React: serve a Server e Client Components.

/** Largura da coluna de resumo, a mesma nas três telas. */
export const DETAIL_SUMMARY_CLASS =
  'min-w-[330px] xl:max-w-[330px] 2xl:min-w-[400px] 2xl:max-w-[400px]';

/**
 * Grade e espaçamento do `InfoList` do resumo, os do `ProfileSection`. Vai pelo `className`: o
 * padrão do `InfoList` (`gap-4`) continua no diálogo da mídia e na versão.
 */
export const DETAIL_SUMMARY_LIST_CLASS =
  'grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-y-7 gap-x-4';
