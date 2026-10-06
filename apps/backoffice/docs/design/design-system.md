# Design system do Backoffice

Consulte ao criar ou mudar telas. Os temas dos sites são do `@orakel/tokens`; este é só da
ferramenta interna. Meta de acessibilidade: `docs/design/accessibility.md` da raiz (WCAG 2.2 AA).

- **Componentes:** shadcn/ui (estilo new-york), copiados em `src/components/ui/` (tabela, badge,
  button, input, label, textarea e checkbox, sem Radix: `<select>` e checkbox nativos). Componente novo do catálogo: copie a fonte do shadcn para ali e
  ajuste aos tokens; o CLI não instala dependências fora do `catalog` da raiz.
- **Estilização:** Tailwind 4, só com os tokens de `src/app/globals.css` (`background`,
  `foreground`, `muted`, `border`, `primary`, `destructive`, `warning`); nada de cor solta.
- **Temas:** claro e escuro pela preferência do sistema (`prefers-color-scheme`).
- **Tabelas:** TanStack Table 9 (`useTable` com `tableFeatures`); a biblioteca traz skills
  em `node_modules/@tanstack/react-table/skills/`.
- **Estado pausado:** badge `warning` com o motivo, sempre visível na lista de sites.
- **Formulários:** gerados do schema Zod com `SchemaForm` (`src/components/forms/`), sobre
  react-hook-form + zodResolver; a validação é só a do schema. O gerador desenha texto,
  número, booleano, enum, objeto (`fieldset`) e lista de objetos (adicionar e remover).
  Rótulos e dicas por caminho (`items.*.question`); `hidden` para o que é do servidor
  (`n`, `type`). O que o schema sozinho não descreve (rich text, seletor de mídia ou de
  entidade) entra por `fields`, um campo registrado por caminho, com `*` no lugar dos
  índices, que recebe `id`, `label`, `value`, `onChange`, `invalid` e `describedBy` (ligue
  esses dois ao controle). Nó sem desenho e sem campo registrado aparece como aviso.
  Dentro de um formulário maior (`FormProvider`), `SchemaFields` desenha um schema sob um
  prefixo (`blocks.2`), com os caminhos completos no registro (`blocks.*.content`): é como o
  editor de conteúdo monta cada bloco.
  Formulário escrito à mão (como o da configuração do site, #29) só até migrar (#47).
- **Rich text:** TipTap só com o que o `RichTextSchema` aceita (`src/components/forms/`).
  Registre `richTextField('richText')` para texto e textos institucionais, e
  `richTextField('inlines')` (um parágrafo, sem intertítulo nem lista) para citação, resposta
  de FAQ e legenda. O valor é sempre a árvore do content-model; colar HTML descarta o que o
  schema não aceita, e link com endereço inválido vira texto.
- **Testes de componente:** `*.test.tsx` com `// @vitest-environment happy-dom` e Testing
  Library (rótulos por `getByLabelText`, teclado por `user-event`).
