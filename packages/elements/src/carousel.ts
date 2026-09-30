// <ok-carousel>: botões de anterior e próximo sobre a trilha com scroll-snap do degrau 1.
//
//   <ok-carousel>
//     <ul data-ok-track id="…">…</ul>
//     <button type="button" data-ok-prev hidden>Anterior</button>
//     <button type="button" data-ok-next hidden>Próximo</button>
//   </ok-carousel>
//
// Sem autoplay (WCAG 2.2.2). Sem o elemento, a trilha continua rolando e os botões ocultos.
import { OkElement } from './base.ts';
import { prefersReducedMotion } from './motion.ts';

export class OkCarousel extends OkElement {
  protected setup(signal: AbortSignal): void {
    const track = this.querySelector<HTMLElement>('[data-ok-track]');
    const prev = this.querySelector<HTMLButtonElement>('button[data-ok-prev]');
    const next = this.querySelector<HTMLButtonElement>('button[data-ok-next]');
    if (!track || !prev || !next) return;

    for (const button of [prev, next]) {
      button.hidden = false;
      if (track.id) button.setAttribute('aria-controls', track.id);
    }

    const update = () => {
      const max = track.scrollWidth - track.clientWidth;
      prev.disabled = track.scrollLeft <= 1;
      next.disabled = track.scrollLeft >= max - 1;
    };

    const step = (direction: 1 | -1) => {
      const item = track.firstElementChild;
      const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
      const width = item?.getBoundingClientRect().width || track.clientWidth;
      track.scrollBy({
        left: direction * (width + gap),
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
    };

    prev.addEventListener('click', () => step(-1), { signal });
    next.addEventListener('click', () => step(1), { signal });
    track.addEventListener('scroll', update, { signal, passive: true });
    window.addEventListener('resize', update, { signal });
    update();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ok-carousel': OkCarousel;
  }
}
