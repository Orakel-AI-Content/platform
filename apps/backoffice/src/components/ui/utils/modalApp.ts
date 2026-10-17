// Contêiner da app para os diálogos sobre o react-modal (#209; não é do Ecme). O layout raiz
// envolve as páginas num <div id="app-root">, que o react-modal recebe como `appElement` (o
// `aria-hidden` enquanto há diálogo aberto) e que fica `inert` no mesmo período: só
// `aria-hidden` sobre conteúdo focável é violação do axe (`aria-hidden-focus`), e o `inert`
// também tira a página do Tab e do clique. O portal dos diálogos fica no <body>, fora dele.

export const APP_ELEMENT_ID = 'app-root';

/** Diálogos abertos agora; o `inert` só sai quando o último fecha (ConfirmDialog sobre Drawer). */
let openDialogs = 0;

function syncInert() {
  const app = document.getElementById(APP_ELEMENT_ID);
  if (app) app.inert = openDialogs > 0;
}

/** Marca um diálogo aberto e devolve a função que o desmarca (chame só no navegador). */
export function holdAppInert(): () => void {
  openDialogs += 1;
  syncInert();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    openDialogs -= 1;
    syncInert();
  };
}
