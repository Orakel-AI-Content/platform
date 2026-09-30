# Design system do Backoffice

Consulte ao criar ou mudar telas. Os temas dos sites são do `@orakel/tokens`; este é só da
ferramenta interna. Meta de acessibilidade: `docs/design/accessibility.md` da raiz (WCAG 2.2 AA).

- **Componentes:** shadcn/ui (estilo new-york), copiados em `src/components/ui/` (tabela e
  badge nesta geração). Componente novo do catálogo: copie a fonte do shadcn para ali e
  ajuste aos tokens; o CLI não instala dependências fora do `catalog` da raiz.
- **Estilização:** Tailwind 4, só com os tokens de `src/app/globals.css` (`background`,
  `foreground`, `muted`, `border`, `primary`, `destructive`, `warning`); nada de cor solta.
- **Temas:** claro e escuro pela preferência do sistema (`prefers-color-scheme`).
- **Tabelas:** TanStack Table 9 (`useTable` com `tableFeatures`); a biblioteca traz skills
  em `node_modules/@tanstack/react-table/skills/`.
- **Estado pausado:** badge `warning` com o motivo, sempre visível na lista de sites.
