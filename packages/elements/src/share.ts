// <ok-share>: compartilhamento nativo (Web Share API), só onde o navegador oferece —
// sobretudo celulares. Sem a API, o botão continua oculto e fica o copiar link.
//
//   <ok-share data-title="…" data-url="https://…">
//     <button type="button" data-ok-share hidden>Compartilhar</button>
//   </ok-share>
import { OkElement } from './base.ts';

export class OkShare extends OkElement {
  protected setup(signal: AbortSignal): void {
    const button = this.querySelector<HTMLButtonElement>('button[data-ok-share]');
    if (!button || !('share' in navigator)) return;

    const data: ShareData = {
      title: this.dataset.title ?? document.title,
      url: this.dataset.url ?? location.href,
    };
    if ('canShare' in navigator && !navigator.canShare(data)) return;

    button.hidden = false;
    button.addEventListener(
      'click',
      () => {
        // Cancelar a janela de compartilhamento rejeita a promessa: não é erro.
        navigator.share(data).catch(() => undefined);
      },
      { signal },
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ok-share': OkShare;
  }
}
