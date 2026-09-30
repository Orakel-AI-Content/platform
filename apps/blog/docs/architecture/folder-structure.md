# Estrutura de pastas do blog

```
src/
├── env.ts  content.config.ts  middleware.ts  astro-env.d.ts
├── data/           site-source, collections (build), preview (SSR), fixture-fetch, errors
├── routing/        resolve.ts: siteRoutes, resolvePath, enumeratePaths
├── render/         links, datas, sumário, tipo de página
├── measurement/    Consent Mode e GA4
├── checks/         orçamento de JS
├── integrations/   site-files (fim do build)
├── pages/          [...path].astro, 404.astro, orakel-edge.json.ts
├── layouts/        Base.astro
├── views/          PageView (escolhe preset/view), Page, Institutional, Search, NotFound
├── presets/        home, artigo, categoria, autor × Padrao, Revista
├── components/     ArticleCard, Image, Pagination, Carousel, Header, Footer, SearchForm, AuthorBox, ShareLinks, blocks/, icons/
└── styles/         global.css, layout.css
scripts/build-examples.ts · e2e/ (axe, paridade, servidor estático)
```

**Tipo de página novo:** rota no core → entrada em `siteRoutes` → view ou preset → `pageType` e `JS_BUDGET_KB` → páginas no `a11y.spec.ts`.

**Preset novo:** ADR 0006. **Bloco novo:** schema no content-model → caso em `components/blocks/Blocks.astro`. **Componente interativo:** HTML do degrau 1 aqui (partes do degrau 2 com `hidden`); comportamento no `elements`, importado pelo subcaminho num `<script>` do componente; caso novo no `e2e/interactions.spec.ts`.
