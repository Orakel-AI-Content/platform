/**
 * Registra o elemento uma vez. Fora do navegador (SSR, testes sem DOM) não faz nada; tag já
 * registrada é ignorada, para o mesmo módulo carregado duas vezes não quebrar a página.
 */
export function define(tag: string, element: CustomElementConstructor): void {
  if (typeof customElements === 'undefined' || customElements.get(tag)) return;
  customElements.define(tag, element);
}
