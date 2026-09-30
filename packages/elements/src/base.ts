// Base dos elementos (ADR 0002 da unidade): só comportamento sobre o HTML que o servidor
// mandou (light DOM). Todos os listeners usam o `signal`, que é abortado quando o elemento
// sai do documento; reconectar liga tudo de novo.
export abstract class OkElement extends HTMLElement {
  #controller: AbortController | undefined;

  connectedCallback(): void {
    this.#controller?.abort();
    const controller = new AbortController();
    this.#controller = controller;
    // O elemento conecta antes de o parser inserir os filhos: liga o comportamento só
    // depois que o HTML dele existe (fim do parse, ou o microtask seguinte).
    const start = () => {
      if (!controller.signal.aborted && this.isConnected) this.setup(controller.signal);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start, {
        once: true,
        signal: controller.signal,
      });
    } else {
      queueMicrotask(start);
    }
  }

  disconnectedCallback(): void {
    this.#controller?.abort();
    this.#controller = undefined;
  }

  /**
   * Liga o comportamento. Faltou uma parte do HTML? Não faça nada: o degrau 1 continua
   * funcionando sem o elemento.
   */
  protected abstract setup(signal: AbortSignal): void;

  /** Anuncia um texto numa região `aria-live` (limpa antes, para repetir o anúncio). */
  protected announce(region: HTMLElement | null, text: string | undefined): void {
    if (!region || !text) return;
    region.textContent = '';
    queueMicrotask(() => {
      region.textContent = text;
    });
  }
}
