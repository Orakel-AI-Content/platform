// Trava de segurança (`05`, seção 5.3; ADR 0003 da unidade): o build aborta se a contagem
// de páginas cair mais que a tolerância em relação à versão ativa, salvo despublicação em
// massa declarada no backoffice.
import { ClassifiedError } from '../failures.ts';

export type PageDropInput = {
  pages: number;
  /** Páginas da versão ativa; ausente no primeiro build do site. */
  activePages: number | undefined;
  tolerance: number;
  allowMassUnpublish: boolean;
};

export function checkPageDrop(input: PageDropInput): void {
  const { pages, activePages, tolerance, allowMassUnpublish } = input;
  if (!(tolerance >= 0 && tolerance <= 1)) {
    throw new ClassifiedError(`PAGE_DROP_TOLERANCE fora de 0–1: ${tolerance}`, 'permanent');
  }
  if (allowMassUnpublish || activePages === undefined || activePages === 0) return;
  const minimum = activePages * (1 - tolerance);
  if (pages < minimum) {
    const drop = Math.round((1 - pages / activePages) * 100);
    throw new ClassifiedError(
      `Trava de segurança: ${pages} páginas contra ${activePages} da versão ativa (queda de ${drop}%, tolerância ${Math.round(tolerance * 100)}%). Declare a despublicação em massa no backoffice se for intencional.`,
      'permanent',
    );
  }
}
