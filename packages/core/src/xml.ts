// Escape para XML (sitemap, RSS). Remove os caracteres de controle que o XML 1.0 proíbe.

// eslint-disable-next-line no-control-regex -- justamente os caracteres de controle
const FORBIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function escapeXml(text: string): string {
  return text
    .replace(FORBIDDEN, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';
