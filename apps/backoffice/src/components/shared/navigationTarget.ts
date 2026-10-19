// Clique que navega para outra tela nesta aba: a regra do indicador de navegação (#77) e do
// aviso ao sair do editor (#111).

/** O clique abre outra tela nesta aba? (Não: nova aba, modificador, download, externo.) */
export function navigationTarget(event: MouseEvent): URL | undefined {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return undefined;
  }
  const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!(anchor instanceof HTMLAnchorElement)) return undefined;
  if (anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) {
    return undefined;
  }
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return undefined;
  // Mesmo endereço (ou só a âncora): nada a carregar.
  if (url.pathname === window.location.pathname && url.search === window.location.search) {
    return undefined;
  }
  return url;
}
