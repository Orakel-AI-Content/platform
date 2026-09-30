# 0004 – Head em estrutura neutra, renderizada com escape no core

- Status: aceito
- Data: 2026-09-30

## Decisão

- `seoHead(page, snapshot)` devolve `HeadTag[]` (`title`, `meta`, `link`, `jsonld`) para `home`, `content` (artigo ou página), `taxonomy`, `author`, `institutional` e `search`.
- Title: `seo.title` ou `<título> | <site>`; página n: `— Página n`. Canonical: `seo.canonical` ou a própria URL (paginação aponta para si). Open Graph com `og:locale`, imagem da capa (maior variante, preferindo formatos mais aceitos) e `article:*` nos artigos; `twitter:card` pela presença de imagem.
- `meta robots noindex` na busca e em todo o site com `indexavel` desligado (repete o `_headers`, para o SSR).
- `renderHead` é o único lugar que gera HTML: escapa atributos e escreve o JSON-LD com `<`, `>`, `&`, U+2028 e U+2029 escapados. O blog usa `<Fragment set:html={renderHead(tags)} />`.

## Consequências

Mesmo HTML no estático e no SSR (paridade); o escape fica na cobertura de 90%.
