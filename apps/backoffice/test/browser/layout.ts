// Medida de layout dos testes de componente: só a rolagem horizontal da página, usada pelo
// Drawer da barra lateral. As medidas por tela (linhas por célula, colunas visíveis, corte)
// saíram com o ADR 0020 da raiz.

/** Quanto a página passa da janela na horizontal, em pixels (0 = não rola). */
export function pageOverflow(): number {
  const root = document.documentElement;
  return root.scrollWidth - root.clientWidth;
}
