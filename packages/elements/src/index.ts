// Subcaminho ".": as classes e o `define`, sem registrar nada. Para usar um elemento na
// página, importe o subcaminho dele (ex.: `@orakel/elements/carousel`), que registra a tag.
// As classes estendem HTMLElement: importe só no navegador.
export { OkElement } from './base.ts';
export { define } from './define.ts';
export { prefersReducedMotion } from './motion.ts';
export { OkCarousel } from './carousel.ts';
export { OkMenu } from './menu.ts';
export { OkCopyLink, type CopyEventDetail } from './copy-link.ts';
export { OkShare } from './share.ts';

/** Tags dos elementos, na ordem da documentação. */
export const ELEMENT_TAGS = ['ok-carousel', 'ok-menu', 'ok-copy-link', 'ok-share'] as const;
