// Rótulos dos campos de metadados do conteúdo, por caminho: os do editor (`ContentEditor`) e os
// do "onde" das checagens da revisão (`reviewCheckItems`), para os dois falarem igual.

export const CONTENT_META_LABELS: Record<string, string> = {
  kind: 'Tipo',
  'kind=article': 'Artigo',
  'kind=page': 'Página',
  slug: 'Slug',
  title: 'Título',
  description: 'Descrição',
  authorIds: 'Autores',
  taxonomyIds: 'Taxonomias',
  coverMediaId: 'Capa',
  publishedAt: 'Data de publicação',
  seo: 'SEO',
  'seo.title': 'Título para buscadores',
  'seo.description': 'Descrição para buscadores',
  'seo.canonical': 'Endereço canônico',
};
