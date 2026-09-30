# 0007 – JSON-LD num @graph por página

- Status: aceito
- Data: 2026-09-30

## Decisão

- Artigo: `Article` (headline, description, datas, idioma, `mainEntityOfPage`, imagem da capa, `author` e `publisher` por `@id`) + `Person` dos autores + `Organization` + `BreadcrumbList` (Início → primeira categoria → artigo).
- Página de conteúdo, taxonomia, institucional: `BreadcrumbList`. Autor: `Person` (nome, URL, bio, avatar, `knowsAbout`) + `BreadcrumbList`. Home: `Organization`. Busca: nenhum.
- `@id`: `https://<domínio>/#organization`, `<URL do autor>#person`, `<URL do artigo>#article`.
- `Organization` só com nome, URL e `@id`: logo e perfis sociais esperam campos opcionais na configuração do site (pendência do `content-model` e do backoffice).
