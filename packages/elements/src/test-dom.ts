// Monta o HTML do degrau 1 no documento do happy-dom e registra os elementos. Fora da
// superfície pública.
import './register/carousel.ts';
import './register/copy-link.ts';
import './register/menu.ts';
import './register/share.ts';

/** Põe o HTML no documento e espera os elementos ligarem o comportamento. */
export async function mount(html: string): Promise<HTMLElement> {
  document.body.innerHTML = html;
  await flush();
  return document.body;
}

/** Espera os microtasks (anúncios em aria-live, promessas do clipboard). */
export function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** O happy-dom não calcula layout: fixa as medidas da trilha para o teste. */
export function setScroll(
  element: HTMLElement,
  sizes: { scrollWidth: number; clientWidth: number; scrollLeft: number },
): void {
  for (const [name, value] of Object.entries(sizes)) {
    Object.defineProperty(element, name, { configurable: true, writable: true, value });
  }
}
