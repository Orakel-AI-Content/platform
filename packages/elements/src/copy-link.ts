// <ok-copy-link>: botão que copia o link do campo (degrau 1: o campo selecionável).
//
//   <ok-copy-link data-copied="Link copiado" data-failed="Selecione e copie o link">
//     <label>Link <input data-ok-url readonly value="https://…"></label>
//     <button type="button" data-ok-copy hidden>Copiar link</button>
//     <span data-ok-status role="status"></span>
//   </ok-copy-link>
//
// Os textos vêm do HTML (idioma do site). Sem a API de clipboard, seleciona o texto do
// campo para o leitor copiar. Emite `ok-copy` ({ url }) quando copia.
import { OkElement } from './base.ts';

export type CopyEventDetail = { url: string };

export class OkCopyLink extends OkElement {
  protected setup(signal: AbortSignal): void {
    const field = this.querySelector<HTMLInputElement>('input[data-ok-url]');
    const button = this.querySelector<HTMLButtonElement>('button[data-ok-copy]');
    if (!field || !button) return;
    const status = this.querySelector<HTMLElement>('[data-ok-status]');

    button.hidden = false;
    button.addEventListener('click', () => void this.copy(field, status), { signal });
  }

  private async copy(field: HTMLInputElement, status: HTMLElement | null): Promise<void> {
    const url = field.value;
    try {
      if (!('clipboard' in navigator)) throw new Error('Clipboard indisponível');
      await navigator.clipboard.writeText(url);
      this.announce(status, this.dataset.copied);
      this.dispatchEvent(
        new CustomEvent<CopyEventDetail>('ok-copy', { bubbles: true, detail: { url } }),
      );
    } catch {
      field.focus();
      field.select();
      this.announce(status, this.dataset.failed);
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ok-copy-link': OkCopyLink;
  }
}
