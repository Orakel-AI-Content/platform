# Migração da interface para o Ecme

Registro do porte do Backoffice para o template Ecme (decisão: ADR 0016): onde está o template,
o que foi avaliado, mapeado e decidido, e as regras de porte de uma peça nova. O padrão vigente de
toda tela é `docs/design/design-system.md`.

## Onde está o template

- Repositório: `Orakel-AI-Content/design-reference`, Ecme **v1.3.10** com a **stack modernizada**
  (React 19.3, Vite 8, TypeScript 6, Tailwind 4.3 CSS-first) e sem alteração de layout. Referência
  fixada no commit `e5f9a1d`, o merge de Orakel-AI-Content/design-reference#1 na `main`. O
  `CLAUDE.md` de lá descreve a estrutura e a stack.
- Ler um arquivo sem clonar:
  `gh api 'repos/Orakel-AI-Content/design-reference/contents/<caminho>?ref=e5f9a1d' --jq .content | base64 -d`.
  Árvore: `gh api 'repos/Orakel-AI-Content/design-reference/git/trees/e5f9a1d?recursive=1'`.
- Clone local, se preferir: ao lado deste repositório, em `../design-reference`, lido em
  `e5f9a1d` (`git show e5f9a1d:<caminho>`). Nunca dentro do monorepo.
- Demo e documentação oficiais: `ecme-react.themenate.net`.

## Avaliação do template

| Item                         | Ecme                                                                                                                                                                                                                                                                                                                                                 | Backoffice hoje                                                                               | No porte                                                                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework                    | Vite 8 + `react-router` 8 (modo declarativo); rotas por config com `lazy()` (`src/configs/routes.config`)                                                                                                                                                                                                                                            | Next 16 App Router, Server Components                                                         | As rotas continuam sendo pastas em `src/app`. `routes.config`, `AllRoutes`, `AppRoute`, `ProtectedRoute` e `routeKeyStore` não entram                          |
| React / TS                   | React 19.3, sem `forwardRef` (`ref` é prop); TS 6 estrito com `moduleResolution: bundler`                                                                                                                                                                                                                                                            | React 19.3, TS 6 estrito                                                                      | `ui/` entra quase igual; acrescentar `'use client'` e ajustar tipos ao `tsconfig` do monorepo                                                                  |
| Tailwind                     | v4.3 CSS-first em `src/assets/styles/tailwind/index.css`: `@theme inline` aponta para variáveis em `@layer theme`, `@custom-variant dark` por classe; `.dark` repete `:root` e o escuro sai das variantes `dark:`                                                                                                                                    | v4 com `@theme inline` e tokens OKLCH                                                         | Levar o `@theme inline`, as variáveis e o `@custom-variant dark` para `globals.css`                                                                            |
| Cores                        | `primary` `#2a85ff` (+ `-deep`, `-mild`, `-subtle`), `error`, `success`, `info`, `warning` (+ `-subtle`), `neutral`, `gray-50…950`                                                                                                                                                                                                                   | `primary`, `muted`, `destructive`, `success`, `warning`, `info`…                              | Nomes do Ecme. `destructive` vira `error`; `muted` vira a escala `gray`                                                                                        |
| Fonte                        | Inter por `@import` do Google Fonts                                                                                                                                                                                                                                                                                                                  | pilha do sistema                                                                              | Inter por `next/font` (sem requisição externa em tempo de execução)                                                                                            |
| Tema                         | zustand `persist` em localStorage; `useDarkMode` e `useThemeSchema` mexem em `<html>` num `useEffect`; 5 presets; ThemeConfigurator                                                                                                                                                                                                                  | `prefers-color-scheme`                                                                        | Modo claro/escuro (e sistema) em cookie, aplicado no `<html>` pelo layout raiz; sem flash. Só o preset padrão                                                  |
| Layouts                      | collapsibleSide, stackedSide, topBarClassic, framelessSide, contentOverlay, blank                                                                                                                                                                                                                                                                    | header + grade lateral de 12rem                                                               | Só **CollapsibleSide**                                                                                                                                         |
| Navegação                    | `NavigationTree` (`key`, `path`, `title`, `icon`, `type`, `authority`, `subMenu`); ícone por chave em `navigation-icon.config.tsx` (`react-icons/pi`); item ativo pela `key` da rota                                                                                                                                                                 | `SiteNav` com itens fixos e `can()`                                                           | `src/configs/navigation.config.ts` tipado; `authority` vira lista de **permissões** de `rbac.ts`, conferida com `can()`; item ativo por `usePathname()`        |
| Componentes `ui/`            | ~45: Alert, Avatar, Badge, Button, Calendar, Card, Checkbox, Dialog, Drawer, Dropdown, Form, Input, InputGroup, Menu, Notification, toast, Pagination, Progress, Radio, ScrollBar, Segment, Select, Skeleton, Spinner, Steps, Switcher, Table, Tabs, Tag, TimeInput, Timeline, Tooltip, Upload, DatePicker…                                          | shadcn: button, badge, input, label, textarea, checkbox, table; `actions-menu`, `icon-button` | Substituem os do shadcn. Portar sob demanda (o que a tela usa), não o catálogo inteiro de uma vez                                                              |
| Componentes `shared/`        | DataTable (TanStack 9 com `useTable` e `tableFeatures`), AdaptiveCard, Container, ConfirmDialog, Loading, StickyFooter, AuthorityCheck, wrappers de libs                                                                                                                                                                                             | `list-controls`, tabelas próprias, `EmptyState`, `StatusScreen`                               | DataTable como no Ecme (controlado: quem usa entrega a página), com página, ordem e tamanho (`por-pagina`, com `pageSizes`) na URL pelo `list-state.ts` (#215) |
| Dependências dos componentes | `@floating-ui/react` (Dropdown, Tooltip, DatePicker), `react-modal` (Dialog, Drawer), `motion` (`motion/react`: Alert, Dialog, Drawer, FormItem, MenuCollapse, Tooltip, toast), `react-select`, `simplebar-react`, `dayjs`, `es-toolkit` (Checkbox, Dropdown, Input, Upload), `react-icons`, `classnames`, `tailwind-merge`; editor rico em Tiptap 3 | cva, clsx, tailwind-merge, lucide-react                                                       | Versão no `catalog` da raiz, `catalog:` na unidade. `es-toolkit` só se não der para trocar por código local pequeno                                            |

**Problemas do template a corrigir no porte:**

- Muitos componentes usam `classnames` sem `tailwind-merge` (Card, Dialog, Input, Menu, Table,
  Tabs). No porte, usar sempre o `classNames` de `ui/utils` (`twMerge(cn(...))`).
- `useResponsive` (`useState(getResponsiveState())`), `Masonry` (`useWindowWidth`) e `Chart` leem
  `window.innerWidth` durante a renderização e quebram no SSR.
- `toast` monta uma raiz React própria em `document.body` com `createRoot`: no Next, preferir um
  provedor no layout.
- `authStore` grava a sessão em localStorage sempre; não entra.

**Não entra:** `src/mock`, `public/data`, imagens demo de `public/img`, as views de `guide`,
`ui-components`, `auth-demo`, `concepts`, `dashboards` e `others/Landing`, `assets/markdown`,
`assets/styles/docs`, `components/docs`, `mdDynamicImporter.ts`, Firebase e OAuth, axios e
`services/`, `locales/` e i18next, `auth/`, as telas de login, os outros cinco layouts e o
ThemeConfigurator completo.

## Mapeamento

| Ecme                                                                                                       | Backoffice                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/ui/*`                                                                                      | `src/components/ui/` (substitui o shadcn, um componente por pasta como no Ecme)                                                                               |
| `src/components/shared/*`                                                                                  | `src/components/shared/`                                                                                                                                      |
| `src/components/template/{Header,SideNav,SideNavToggle,MobileNav,UserProfileDropdown,VerticalMenuContent}` | `src/components/template/`                                                                                                                                    |
| `src/components/layouts/PostLoginLayout/components/CollapsibleSide.tsx`                                    | `src/components/layouts/CollapsibleSide.tsx`, usado por `src/app/(admin)/layout.tsx`                                                                          |
| `src/views/<área>/<Tela>/components/*`                                                                     | `src/components/<área>/` (`contents/`, `editorial/`, `forms/`, `media/`, `review/`, `sites/`), componentes de uma tela só, chamados pelas rotas de `src/app/` |
| `src/configs/navigation.config/*`, `navigation-icon.config.tsx`                                            | `src/configs/navigation.config.ts` (áreas globais e do site) e `src/configs/navigation-icon.config.tsx`                                                       |
| `src/configs/theme.config.ts`, `store/themeStore.ts`                                                       | `src/configs/theme.config.ts` + cookie de tema (sem zustand para o tema, se o cookie bastar)                                                                  |
| `src/assets/styles/{tailwind,components,template}/*`                                                       | `src/app/globals.css` (`@theme` e a `@layer base`) e `src/app/styles/` com as classes de componente em `@layer components`                                    |
| `src/utils/hooks/{useResponsive,useLayout,useMenuActive}`                                                  | não portados                                                                                                                                                  |

## Regras de porte

- **Copiar e adaptar, não reescrever.** O componente portado mantém a API e a aparência do Ecme;
  mudanças só para Next, acessibilidade, tipos e as regras abaixo. Anote no topo do arquivo a
  origem (`Ecme v1.3.10 (e5f9a1d): src/components/ui/Button/Button.tsx`).
- **Next:**
  - `'use client'` em todo componente com hook, contexto ou lib de DOM;
  - `Link` do react-router → `next/link`; `useLocation` → `usePathname`/`useSearchParams`;
    `useNavigate` → `useRouter`;
  - `next/dynamic` com `ssr: false` só para lib que não renderiza no servidor;
  - nada de `window`/`document` fora de `useEffect` ou handler.
- **Servidor:** páginas e layouts continuam Server Components; leem o domínio e passam dados por
  props aos componentes do Ecme. Server Actions e `can()` não mudam.
- **Tema:** cookie lido no layout raiz, que põe a classe no `<html>`; a troca grava o cookie e a
  classe. Respeitar o sistema quando a pessoa não escolheu.
- **Estilo:** só tokens do `@theme`, nenhuma cor solta; `dark:` como no Ecme, exceto nos pares
  que não chegam ao contraste AA, em que o port usa a classe substituta:

  | Uso                                                          | No Ecme                                          | No port                                    |
  | ------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------ |
  | Texto do body, claro                                         | `text-gray-500` (4,35:1)                         | `text-gray-600` (7,17:1)                   |
  | Placeholder do campo, claro                                  | `placeholder:text-gray-400` (2,31:1)             | `placeholder:text-gray-600`                |
  | Placeholder do campo, escuro                                 | `placeholder:text-gray-400` (4,11:1)             | `dark:placeholder:text-gray-300`           |
  | `primary` como texto no cartão, escuro                       | `text-primary` (4,25:1)                          | `dark:text-primary-mild`                   |
  | Texto do Badge, escuro                                       | `text-white` (2,82:1)                            | `text-neutral dark:text-gray-950` (7,02:1) |
  | Fundo das iniciais do Avatar, claro                          | `bg-gray-400` (2,31:1)                           | `bg-gray-600` (7,17:1)                     |
  | Item ativo do Menu na barra, escuro                          | `text-primary` (4,25:1)                          | `dark:text-primary-mild`                   |
  | ✓ da etapa concluída do Steps, escuro                        | `text-white` (3,56:1)                            | `dark:text-gray-950` (5,56:1)              |
  | Hover do título da etapa clicável do Steps no cartão, escuro | `text-primary` (4,25:1)                          | `dark:hover:text-primary-mild`             |
  | Título e ícone da etapa com erro do Steps                    | `text-red-500`/`border-red-500` (fora da paleta) | `text-error`/`border-error`                |
  | Hover do Button `plain`, claro                               | `hover:text-primary-mild` (4,14:1)               | `hover:text-primary-deep` (6,21:1)         |

  O `plainColor` do Button do Ecme tem ainda `dark:primary-mild` e `dark:active:primary-mild`,
  que não são utilities e não geram estilo; o port as tira (#396).

  Par novo de texto ou foco sobre fundo, com ou sem `dark:`, entra em `ECME_PAIRS` do
  `globals-contrast.test.ts` (#217), no tema em que aparece.

- **Camada base:** a `@layer base` do `tailwind/index.css` vem para o `globals.css` (#395) e dá ao
  texto sem classe própria, aos títulos `h1`–`h6` e ao `hr` o estilo do template; as peças
  portadas contam com ela (os títulos de Dialog, Drawer e Card são `h4`/`h5` sem classe). Ficam
  de fora a cor do body, trocada pela substituta da tabela acima, o fundo do body (`bg-neutral`;
  o `main` pinta `gray-100`) e a regra de `border-color` em `*`, que a preflight do Tailwind 4
  já cobre. A `.heading-text` vem da `@layer components` do mesmo arquivo.

- **Acessibilidade (não negociável):**
  - landmarks: `banner` com o e-mail e os papéis, `main#conteudo`, `nav "Principal"`,
    `nav "Áreas do site"`, `nav "Trilha de navegação"`, `nav "Paginação"`;
  - skip link "Pular para o conteúdo" como primeira parada do Tab; Enter leva o foco ao `main`;
  - `aria-current` no item ativo da navegação, da trilha e do seletor de site;
  - foco visível de 2px na cor `ring` nos dois temas; alvos de pelo menos 24×24 px;
  - `prefers-reduced-motion` desliga as animações do `motion`;
  - `react-modal`: `appElement` definido, título ligado por `aria-labelledby`, foco devolvido ao
    botão de origem; `react-select`: rótulo associado; Dropdown e Tooltip acessíveis por teclado.
- **Testes:** cada história migra os testes das telas que toca. Seletor por role e nome; nada de
  `data-testid`. Asserção de classe só para cor de estado, com os nomes novos.

## Matriz de testes

| Área                                                                      | O que precisa continuar                                                                                                                                                 | O que muda                                                                                                                                                                          |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell (`test/e2e/header.spec.ts`, `focus.spec.ts`, `site-layout.spec.ts`) | skip link e Tab, `banner`, `main`, "Sair", "Orakel Backoffice", textos das áreas do site (`toHaveText([...AREAS])`), `aria-current`, outline de 2px nos dois temas      | estrutura do header e da barra lateral, recolher a barra, menu do perfil                                                                                                            |
| Listas (`sites-list.spec.ts`, `contents.spec.ts`, `editorial.spec.ts`)    | página sem rolagem horizontal (na lista de sites, a 1280px e sem rolar nem no contêiner da tabela, #248), no máximo duas linhas por célula, "Paginação", filtros na URL | DataTable do Ecme; "Mais ações" passa de Popover nativo (`[popover]:popover-open`) para Dropdown                                                                                    |
| Editor (`contents.spec.ts`, `ContentEditor.test.tsx`)                     | toolbar ≤ 40px, botões de bloco ≥ 24px, bloco recolhido ≤ 72px, rodapé fixo                                                                                             | barra vira o `BottomStickyBar` do formulário de tela (#332); classes do Tiptap 3                                                                                                    |
| Mídia (`midia.spec.ts`, `MediaPicker`, `MediaDetails`, `UploadQueue`)     | foco preso no diálogo, Esc fecha, foco volta à origem, `role="status"` da paginação e da fila                                                                           | `<dialog>` nativo vira `Dialog` (`react-modal`)                                                                                                                                     |
| Revisão (`revisao.spec.ts`)                                               | iframe da prévia, checklist, aprovar                                                                                                                                    | painel em Card                                                                                                                                                                      |
| Estados (`page-states.spec.ts`, `error.test.tsx`, `not-found.test.tsx`)   | 404 de verdade (sem `loading.tsx`), "Sem acesso", erro com nova tentativa                                                                                               | aparência                                                                                                                                                                           |
| Unitários com classe                                                      | —                                                                                                                                                                       | ~30 asserções (`text-success`, `bg-muted`, `bg-destructive`, `size-8`, `aria-pressed:bg-primary`, `position-area:`) e `siteLabels.test.ts` (variantes de badge distintas por grupo) |
| Contraste (`globals-contrast.test.ts`)                                    | AA em todos os pares de texto                                                                                                                                           | passa a ler a paleta do Ecme                                                                                                                                                        |

## Riscos

- **Acessibilidade** de `react-modal`, `react-select`, Dropdown e Tooltip: auditar com axe e
  teclado em cada componente portado; corrigir no componente, não na tela.
- **Flash de tema e layout no SSR:** resolvido pelo cookie; sem zustand `persist` para o que o
  servidor renderiza.
- **Contraste:** `primary` `#2a85ff` com branco dá cerca de 3,6:1, abaixo de 4,5:1 para texto
  pequeno, tanto em link sobre fundo branco quanto em texto branco no botão sólido. Escurecer o
  `primary` (ou usar `primary-deep` como base) até passar, mantendo o tom.
- **Peso do bundle:** `motion` e `react-select` só nas telas que usam; conferir o tamanho
  do build depois da fundação.
- **Duas UIs ao mesmo tempo** durante o épico: as histórias seguem a ordem abaixo para que o
  shell já esteja pronto quando as telas migrarem.

## Histórias do épico

1. **Fundação:** dependências no `catalog`; `@theme` com os tokens do Ecme; Inter por
   `next/font`; tema claro/escuro por cookie sem flash; `globals-contrast.test.ts` na paleta nova.
2. **Primitivas:** portar `ui/` e `shared/` usados pelas telas (Button, Card, Badge/Tag, Input,
   Select, Checkbox, Form, Dialog, Drawer, Dropdown, Tooltip, Table, Pagination, Tabs, toast,
   DataTable, ConfirmDialog, AdaptiveCard, Loading, StickyFooter), com auditoria de
   acessibilidade e testes.
3. **Shell:** CollapsibleSide, Header, SideNav recolhível, MobileNav, perfil com "Sair", seletor
   de site, trilha e `navigation.config` ligado ao RBAC; landmarks e skip link preservados.
4. **Registro de instâncias e telas do site:** lista de sites, cadastro, visão geral,
   configuração e pendências.
5. **Conteúdos e editor:** lista, criação, versões e editor (SchemaForm e TipTap com os
   componentes do Ecme).
6. **Revisão:** fila e tela de revisão.
7. **Mídia:** biblioteca, envio múltiplo, detalhes e seletor.
8. **Editoriais e estados:** autores, taxonomias, menus, textos institucionais; erro, 404 e sem
   acesso.
9. **Limpeza:** remover shadcn, `components.json`, cva e lucide sem uso; reescrever
   `docs/design/design-system.md` para o Ecme; tirar o aviso de transição.

**Fora do épico:** trocar o Next; módulos novos da L4 (publicação agendada, releases, geração,
pageviews), que já nascem no Ecme; i18n; os sites Astro e `@orakel/tokens`; os outros layouts,
dashboards e telas demo do Ecme.
