// Normalização do HTML para a paridade estático × SSR: tira o que difere por construção
// (hash dos assets, prefixo /<site> da visualização, script de eventos e link do RSS, que
// só existem no estático) e os espaços entre tags.
export function normalizeHtml(html: string, previewBase = ''): string {
  let out = html;
  if (previewBase) {
    out = out
      .replaceAll(`href="${previewBase}/`, 'href="/')
      .replaceAll(`action="${previewBase}/`, 'action="/');
  }
  return out
    .replace(/<script type="module"[^>]*>[\s\S]*?<\/script>/g, '')
    .replace(/<link rel="alternate" type="application\/rss\+xml"[^>]*>/g, '')
    .replace(/\/_astro\/([^".]+)\.[A-Za-z0-9_-]{8}\.(css|js)/g, '/_astro/$1.$2')
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim();
}
