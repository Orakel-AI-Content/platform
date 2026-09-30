// Tipo de página declarado em `data-page-type`: escolhe o limite do orçamento de JS e vai
// no pageview das páginas que não são artigo.
import type { PageModel } from '../routing/resolve.ts';

export function pageType(model: PageModel): string {
  switch (model.type) {
    case 'home':
      return 'home';
    case 'content':
      return model.content.kind === 'article' ? 'artigo' : 'pagina';
    case 'taxonomy':
      return { category: 'categoria', tag: 'tag', series: 'serie' }[model.taxonomy.kind];
    case 'author':
      return 'autor';
    case 'institutional':
      return 'institucional';
    case 'search':
      return 'busca';
    case 'not-found':
      return '404';
  }
}
