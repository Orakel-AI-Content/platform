// Tags do <head> numa estrutura neutra, e o único lugar que as transforma em HTML (ADR 0004).
// O escape do JSON-LD impede que um "</script>" num título feche o script.

export type HeadTag =
  | { tag: 'title'; text: string }
  | { tag: 'meta'; attrs: Readonly<Record<string, string>> }
  | { tag: 'link'; attrs: Readonly<Record<string, string>> }
  | { tag: 'jsonld'; data: unknown };

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** JSON seguro dentro de <script>: <, >, & e os separadores de linha do JS escapados. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll(' ', '\\u2028')
    .replaceAll(' ', '\\u2029');
}

function attributes(attrs: Readonly<Record<string, string>>): string {
  return Object.entries(attrs)
    .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
    .join('');
}

function renderTag(tag: HeadTag): string {
  switch (tag.tag) {
    case 'title':
      return `<title>${escapeHtml(tag.text)}</title>`;
    case 'meta':
      return `<meta${attributes(tag.attrs)}>`;
    case 'link':
      return `<link${attributes(tag.attrs)}>`;
    case 'jsonld':
      return `<script type="application/ld+json">${serializeJsonLd(tag.data)}</script>`;
  }
}

/** HTML das tags, uma por linha, na ordem recebida. */
export function renderHead(tags: readonly HeadTag[]): string {
  return tags.map(renderTag).join('\n');
}
