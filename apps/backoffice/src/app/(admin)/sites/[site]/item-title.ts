// Título da aba de uma página de item (#79): "<item> · <área>", ou só a área quando o item não
// pode ser mostrado (sem sessão, sem permissão, inexistente). O layout do site completa com
// "· <site> · Orakel Backoffice".

export function itemTitle(item: string | undefined, area: string): string {
  const label = item?.trim();
  return label ? `${label} · ${area}` : area;
}
