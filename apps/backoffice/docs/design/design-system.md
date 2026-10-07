# Design system do Backoffice

Consulte ao criar ou mudar telas. Os temas dos sites são do `@orakel/tokens`; este é só da
ferramenta interna. Meta de acessibilidade: `docs/design/accessibility.md` da raiz (WCAG 2.2 AA).

- **Componentes:** shadcn/ui (estilo new-york), copiados em `src/components/ui/` (tabela, badge,
  button, input, label, textarea e checkbox, sem Radix: `<select>` e checkbox nativos). Componente novo do catálogo: copie a fonte do shadcn para ali e
  ajuste aos tokens; o CLI não instala dependências fora do `catalog` da raiz.
- **Estilização:** Tailwind 4, só com os tokens de `src/app/globals.css` (`background`,
  `foreground`, `muted`, `border`, `primary`, `destructive`, `warning`, `success`, `info`,
  `ring`); nada de cor solta.
- **Tokens de estado:** `success` e `info` (como `destructive`) servem nos dois usos: texto ou
  borda sobre o fundo (`text-success`, `border-info`) e preenchido com o próprio
  `-foreground` (`bg-success text-success-foreground`). `warning` só tem o uso sobre o fundo.
  Todo par de texto chega a 4,5:1 e o `ring` a 3:1 do fundo, nos dois temas; o
  `globals-contrast.test.ts` lê os tokens do `globals.css` e reprova o par que não chegar.
  Token novo de texto entra também na lista de pares do teste.
- **Foco:** uma regra global `:focus-visible` (`@layer base` do `globals.css`) desenha o
  contorno `ring` de 2px, afastado 2px, em todo elemento focável: links, botões, campos e o
  editor de rich text. Componentes não repetem classes de foco (`focus-visible:outline-*`);
  uma tela só sobrescreve o contorno por motivo explícito. O E2E `focus.spec.ts` confere o
  contorno navegando com `Tab`.
- **Temas:** claro e escuro pela preferência do sistema (`prefers-color-scheme`).
- **Tipografia:** pilha `system-ui`, sem fonte própria, numa escala de quatro tamanhos: título
  da página (`h1`) em `text-2xl font-semibold`; seção (`h2`) em `text-lg font-semibold`;
  corpo em `text-sm`, inclusive rótulos, dicas e erros de campo e mensagens de status de uma
  ação; auxiliar em `text-xs`, só para badges e legendas (data sob um badge, legenda de
  imagem). Texto de campo nunca fica menor que o corpo. Células de tabela usam números
  tabulares (`tabular-nums`, no `TableCell`), para datas e contagens alinharem na coluna.
- **Tabelas:** TanStack Table 9 (`useTable` com `tableFeatures`); a biblioteca traz skills
  em `node_modules/@tanstack/react-table/skills/`.
- **Larguras:** duas utilities de `globals.css`, na `section` (ou `article`) de topo da página,
  nunca um `max-w-*` solto. `form-width` (`max-w-3xl`) para criar e editar, configuração,
  textos institucionais e telas que leem um item (página do site, versão de um conteúdo):
  uma coluna legível. `list-width` (largura cheia do `main`) para as listas e tabelas: sites,
  conteúdos, versões, autores, taxonomias, menus e mídia. O componente de formulário não
  define largura; quem define é a página.
- **Estado pausado:** badge `warning` com o motivo, sempre visível na lista de sites.
- **Telas de estado:** `StatusScreen` (`src/components/status-screen.tsx`), com título (`h1`),
  uma frase do que aconteceu e o que fazer, e a ação de saída (link de volta ou "Tentar de
  novo"). "Não encontrado" (`(admin)/not-found.tsx`, também para endereços sem rota, pelo
  catch-all `(admin)/[...rest]`) e erro (`(admin)/error.tsx` e `global-error.tsx`, pelo
  `ErrorScreen`) a usam. Um caso novo, como a falta de permissão, muda só o conteúdo, sem
  variante visual. A tela de erro nunca mostra a mensagem da exceção, só o `digest`.
- **Carregamento:** `NavigationIndicator` no layout `(admin)`. Acende "Carregando…" numa região
  `role="status"` persistente no clique de um link interno e apaga quando o endereço muda. Não
  use `loading.tsx` nem `Suspense` acima das páginas: o fallback só aparece quando muda o
  segmento logo abaixo dele, e a resposta enviada em streaming faria o `notFound()` responder 200. No E2E, leia o status da tela pelo `main` (`getByRole('main').getByRole('status')`).
- **Formulários:** gerados do schema Zod com `SchemaForm` (`src/components/forms/`), sobre
  react-hook-form + zodResolver; a validação é só a do schema. O gerador desenha texto,
  número, booleano, enum, objeto (`fieldset`) e lista de objetos (adicionar e remover).
  Rótulos e dicas por caminho (`items.*.question`); `hidden` para o que é do servidor
  (`n`, `type`). O que o schema sozinho não descreve (rich text, seletor de mídia ou de
  entidade) entra por `fields`, um campo registrado por caminho, com `*` no lugar dos
  índices, que recebe `id`, `label`, `value`, `onChange`, `invalid` e `describedBy` (ligue
  esses dois ao controle). Nó sem desenho e sem campo registrado aparece como aviso.
  O `onSubmit` pode devolver a recusa do servidor (`{ path, message }[]`): com `path`, vira
  erro do campo; sem, vai para o resumo. Lista vazia em campo opcional (rich text apagado) é
  enviada como ausente.
  Dentro de um formulário maior (`FormProvider`), `SchemaFields` desenha um schema sob um
  prefixo (`blocks.2`), com os caminhos completos no registro (`blocks.*.content`): é como o
  editor de conteúdo monta cada bloco. Referências do site: `mediaField(opções)` (`<select>`,
  `{ optional: true }` para capa) e `entityField(opções, aviso)` (caixas de seleção para
  `authorIds` e `taxonomyIds`), em `src/components/forms/picker-fields.tsx`.
  Campos registrados recebem `ref` (ligue ao controle focável, para o foco do erro chegar) e
  `readOnly` (caminhos em `readOnly`). Para listas de texto, feature flags e opções de
  `RESOURCES`: `linesField`, `flagsField` e `choiceField` (`src/components/forms/site-fields.tsx`).
  Nenhum formulário é escrito à mão: o da configuração do site também usa o gerador (#47).
- **Rich text:** TipTap só com o que o `RichTextSchema` aceita (`src/components/forms/`).
  Registre `richTextField('richText')` para texto e textos institucionais, e
  `richTextField('inlines')` (um parágrafo, sem intertítulo nem lista) para citação, resposta
  de FAQ e legenda. O valor é sempre a árvore do content-model; colar HTML descarta o que o
  schema não aceita, e link com endereço inválido vira texto.
- **Testes de componente:** `*.test.tsx` com `// @vitest-environment happy-dom` e Testing
  Library (rótulos por `getByLabelText`, teclado por `user-event`).
