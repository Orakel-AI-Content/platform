// <ok-menu>: o <details> do menu mobile (degrau 1) passa a fechar com Esc — devolvendo o foco
// ao <summary> — e com clique fora dele.
//
//   <ok-menu><details><summary>Menu</summary>…</details></ok-menu>
import { OkElement } from './base.ts';

export class OkMenu extends OkElement {
  protected setup(signal: AbortSignal): void {
    const details = this.querySelector('details');
    const summary = details?.querySelector('summary');
    if (!details || !summary) return;

    details.addEventListener(
      'keydown',
      (event) => {
        if (event.key !== 'Escape' || !details.open) return;
        details.open = false;
        summary.focus();
      },
      { signal },
    );
    document.addEventListener(
      'click',
      (event) => {
        if (details.open && !(event.target instanceof Node && details.contains(event.target))) {
          details.open = false;
        }
      },
      { signal },
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ok-menu': OkMenu;
  }
}
