# Design system do Backoffice

O Backoffice usa o template **Ecme** (`Orakel-AI-Content/design-reference`, ADR 0016) como
design system. **Toda tela nova ou alterada parte deste guia e do template Ecme:** ache no
template a peça equivalente e porte-a pelas regras de porte de `docs/migration/ecme.md`
(origem anotada no topo do arquivo, `'use client'`, `next/link`, sem `window` no render). Aquele
documento é o registro do porte; o padrão vigente é este.

Os temas dos sites são do `@orakel/tokens`; este guia é só da ferramenta interna. Meta de
acessibilidade: `docs/design/accessibility.md` da raiz (WCAG 2.2 AA).

## Fundação

- **Componentes:** as primitivas do Ecme em `src/components/ui/` (uma pasta por componente,
  como no template: Alert, Avatar, Badge, Button, Card, Checkbox, Dialog, Drawer, Dropdown,
  Form, Input, InputGroup, Menu, Notification, Pagination, Radio, Segment, Select, Skeleton,
  Spinner, Switcher, Table, Tabs, Tag, TimeInput, toast, Tooltip, e o Calendar e o
  DateTimepicker, em `DatePicker/` como no template, com a prop `timeZone` para mostrar os dias e
  a hora de parede no fuso do site e devolver o instante; na troca de horário, a hora repetida
  vale a primeira ocorrência e a inexistente avança pelo salto) e as peças compostas em
  `src/components/shared/` (AdaptiveCard,
  ConfirmDialog, DataTable, Loading, StickyFooter e o `IconButton`, que não tem equivalente no
  template). Componente que a tela precisa e ainda não foi portado: copie a fonte do Ecme,
  mantendo a API e a aparência, e mude só o que Next, acessibilidade e tipos pedem. Porte sob
  demanda, não o catálogo inteiro. Exceção: o subcomponente que a API do componente portado
  expõe vem junto, mesmo sem tela que o use, para a API ficar a do Ecme — `Avatar.Group`
  (`AvatarGroup`) e `Dropdown.Menu` (o submenu, `DropdownSub` e `DropdownSubItem`, que o
  `DropdownMenu` usa para o item que abre o submenu), auditados na vitrine e no E2E. Utilitário
  sem import não fica. As classes de cada componente ficam numa folha por componente
  em `src/app/styles/`, em `@layer components`, importada por `src/app/globals.css`. Junte
  classes sempre com o `classNames` de `src/components/ui/utils/` (`twMerge` sobre `classnames`).
  Ícones do `react-icons` (`react-icons/pi`, como no template), sempre `aria-hidden`.
- **Cores:** Tailwind 4, só com os tokens do `@theme inline` de `src/app/globals.css`; nada de
  cor solta. Os nomes são os do Ecme: `primary` (com `-deep`, `-mild` e `-subtle`), `error`,
  `success`, `info` e `warning` (com `-subtle`), `neutral` (o branco) e a escala `gray-50` a
  `gray-950`. Próprios do Backoffice: `ring` (o foco) e o raio de `rounded-md`. No claro,
  `primary`, `info`, `error`, `success` e `warning` são escurecidos no mesmo tom até 4,5:1 com
  branco; o `.dark` devolve os valores originais do Ecme. A escala `gray`, o `neutral` e os
  `-subtle` são iguais nos dois temas: o escuro sai das variantes `dark:`, como no template
  (fundo da página `bg-neutral dark:bg-gray-950`, texto `text-gray-900 dark:text-gray-100`).
- **Pares de contraste:** todo par de texto chega a 4,5:1 e o foco a 3:1, nos dois temas. O
  `src/app/globals-contrast.test.ts` lê os tokens do `globals.css` e reprova o par que não
  chegar: `PAIRS` com os tokens e `ECME_PAIRS` com as classes como os componentes os combinam.
  Onde a classe do Ecme não chega ao AA, o port usa a substituta:

  | Uso                                       | No Ecme                              | No port                                    |
  | ----------------------------------------- | ------------------------------------ | ------------------------------------------ |
  | Texto do body, claro                      | `text-gray-500` (4,35:1)             | `text-gray-600` (7,17:1)                   |
  | Placeholder do campo, claro               | `placeholder:text-gray-400` (2,31:1) | `placeholder:text-gray-600`                |
  | Placeholder do campo, escuro              | `placeholder:text-gray-400` (4,11:1) | `dark:placeholder:text-gray-300`           |
  | `primary` como texto no cartão, escuro    | `text-primary` (4,25:1)              | `dark:text-primary-mild`                   |
  | Texto do Badge, escuro                    | `text-white` (2,82:1)                | `text-neutral dark:text-gray-950` (7,02:1) |
  | Fundo das iniciais do Avatar, claro       | `bg-gray-400` (2,31:1)               | `bg-gray-600` (7,17:1)                     |
  | Item ativo do Menu na barra, escuro       | `text-primary` (4,25:1)              | `dark:text-primary-mild`                   |
  | Texto do Switcher desligado, claro        | `text-white` (1,26:1)                | `text-gray-900`                            |
  | Texto do Switcher ligado, escuro          | `text-white` (3,56:1)                | `dark:text-gray-950` (5,56:1)              |
  | Item do Segment, claro                    | `text-gray-500` (4,35:1)             | `text-gray-600`                            |
  | Item do Segment, escuro                   | `dark:text-gray-400` (4,11:1)        | `dark:text-gray-200`                       |
  | Foco no Segment, escuro                   | `outline-ring` (2,91:1)              | `dark:outline-primary-mild` (3,50:1)       |
  | Foco no campo do TimeInput, escuro        | `outline-none` (ring: 2,91:1)        | `dark:outline-primary-mild` (3,50:1)       |
  | Dia de outro mês no Calendar, claro       | `text-gray-400` (2,52:1)             | `text-gray-600` (7,81:1), sem negrito      |
  | Dia de outro mês no Calendar, escuro      | `dark:text-gray-600` (1,94:1)        | `dark:text-gray-400` (6,00:1), sem negrito |
  | Dia, mês e ano ativos no Calendar, escuro | `text-white` (3,56:1)                | `dark:text-gray-950` (5,56:1)              |
  | Mês e ano do cabeçalho no hover, escuro   | `hover:text-primary` (4,25:1)        | `dark:hover:text-primary-mild` (5,11:1)    |
  | Mês e ano da grade no hover, escuro       | `hover:bg-gray-100` (1,00:1)         | `dark:hover:bg-gray-600` (7,17:1)          |

  Par novo de texto ou foco sobre fundo, com ou sem `dark:`, entra em `ECME_PAIRS`, no tema em
  que aparece.

- **Tema:** claro, escuro e sistema, por classe no `<html>` (`light` ou `dark`) e
  `@custom-variant dark` por classe, como no Ecme. A escolha fica no cookie de
  `src/configs/theme.config.ts` (`orakel-theme`), lido no layout raiz (`src/app/layout.tsx`),
  que já põe a classe no HTML do servidor. Sem cookie, vale o sistema: um script inline no
  `<head>` aplica a preferência antes da primeira pintura. A troca é o `ThemeSwitcher` do
  cabeçalho (`src/components/template/ThemeSwitcher.tsx`), que grava ou apaga o cookie e troca a
  classe na hora. Sem zustand nem localStorage para o tema. O E2E `theme.spec.ts` confere que
  nenhum quadro sai no tema oposto.
- **Tipografia:** Inter do Ecme, auto-hospedada por `next/font/local` (`src/app/fonts/`), no
  `--font-sans`. Escala de quatro tamanhos: título da página (`h1`) em `text-2xl font-bold`,
  como os títulos do template; seção (`h2`) em `text-lg font-semibold`; corpo em `text-sm`,
  inclusive rótulos, dicas e erros de campo e mensagens de status de uma ação; auxiliar em
  `text-xs`, só para tags e legendas (data sob uma tag, legenda de imagem). Texto de campo nunca
  fica menor que o corpo. Contagens e páginas usam números tabulares (`tabular-nums`).
- **Foco:** uma regra global `:focus-visible` (`@layer base` do `globals.css`) desenha o
  contorno `ring` de 2px, afastado 2px, em todo elemento focável: links, botões, campos e o
  editor de rich text. Componentes não repetem classes de foco (`focus-visible:outline-*`);
  uma tela só sobrescreve o contorno por motivo explícito. O E2E `focus.spec.ts` confere o
  contorno navegando com `Tab`.

## Moldura

- **Moldura e barra lateral:** o `(admin)/layout.tsx` usa o `CollapsibleSide` do Ecme
  (`src/components/layouts/CollapsibleSide.tsx`), o único layout do template que entra.
  `SideNav` à esquerda (290px, 80px recolhida pelo `SideNavToggle`; medidas em
  `src/components/template/constants.ts`) com a marca "Orakel Backoffice", `nav "Principal"`
  com os itens globais e, dentro de um site que a pessoa vê, o seletor de site e
  `nav "Áreas do site"`. Abaixo de `lg`, a barra some e o `MobileNav` abre a mesma navegação
  num Drawer. O `Header` (`banner`) traz o toggle à esquerda e, à direita, o `ThemeSwitcher` e
  o `UserProfileDropdown`, com o e-mail e os papéis no nome do gatilho e "Sair" no menu. O
  `main` (`#conteudo`) tem o fundo do body do Ecme (`bg-gray-100 dark:bg-gray-950`) e os
  gutters do `PageContainer`.
- **Navegação:** os itens vêm de `src/configs/navigation.config.ts` (`NavigationTree` do Ecme,
  com `authority` como lista de permissões de `rbac.ts`), filtrados no servidor pelo RBAC
  (`filterNavigation`, com `can()`; Textos institucionais só com `content.write`). A barra marca
  o item pelo endereço (`activeNavigationKey`, por `usePathname`), com `aria-current="page"`,
  também nas telas de item; Configuração e Pendências marcam a Visão geral. O seletor
  (`SiteSwitcher`, `src/components/template/SiteSwitcher.tsx`) é o `Dropdown` do Ecme com o nome do site,
  listando os sites visíveis (`readVisibleSites`, uma leitura por requisição), cada um levando à
  mesma área (`sameAreaIn`: item, criar e editar caem na lista); o atual com
  `aria-current="true"`. Recolhida, a barra mostra as iniciais, com o nome na dica.
- **Cabeçalho de página:** `PageHeader` (`src/components/shared/PageHeader.tsx`),
  em toda tela de lista: trilha (`nav` "Trilha de navegação", com `aria-current="page"` no item
  atual; opcional, Sites é a raiz), título (`h1`) à esquerda e a ação principal à direita
  (`action`), que quebra para baixo em tela estreita. A página monta a ação no servidor e só a
  passa com permissão; sem ela, o cabeçalho é só o título. Ação principal em `ButtonLink`
  (`src/components/ui/Button/ButtonLink.tsx`, o `Button` sobre `next/link` para Server
  Components) com `variant="solid" size="sm"`; a secundária (baixar o tfvars em Sites) ao lado,
  no `Button` padrão. A tabela nunca desenha o link de criar.
- **Larguras:** duas utilities de `globals.css`, na `section` (ou `article`) de topo da página,
  nunca um `max-w-*` solto. `form-width` (`max-w-3xl`) para criar e editar, configuração,
  textos institucionais e telas que leem um item (página do site, versão de um conteúdo):
  uma coluna legível. `list-width` (largura cheia do `main`) para as listas e tabelas: sites,
  conteúdos, versões, autores, taxonomias, menus e mídia. O componente de formulário não
  define largura; quem define é a página.
- **Carregamento:** `NavigationIndicator` no layout `(admin)`. Acende "Carregando…" numa região
  `role="status"` persistente no clique de um link interno e apaga quando o endereço muda. Não
  use `loading.tsx` nem `Suspense` acima das páginas: o fallback só aparece quando muda o
  segmento logo abaixo dele, e a resposta enviada em streaming faria o `notFound()` (o 404 do
  site inexistente, no layout do site) responder 200. No E2E, leia o status da tela pelo `main`
  (`getByRole('main').getByRole('status')`).

## Acessibilidade

Não negociável, em toda tela e todo componente portado:

- **Landmarks:** `banner` com o e-mail e os papéis, `main#conteudo`, `nav "Principal"`,
  `nav "Áreas do site"`, `nav "Trilha de navegação"`, `nav "Paginação"`.
- **Skip link:** "Pular para o conteúdo" é a primeira parada do Tab, visível só com foco;
  Enter leva o foco ao `main` (`tabIndex={-1}`).
- **`aria-current`:** no item ativo da navegação (`page`), da trilha (`page`) e do seletor de
  site (`true`).
- **Foco e alvos:** foco visível de 2px na cor `ring` nos dois temas (regra global acima);
  alvos de pelo menos 24×24 px.
- **Movimento:** `prefers-reduced-motion` desliga as animações do `motion`, pelo
  `MotionConfig reducedMotion="user"` do `MotionProvider` (`src/components/ui/MotionProvider/`)
  no layout raiz.
- **`react-modal`** (Dialog, Drawer): o contêiner da app é o `appElement`
  (`ModalAppElement`, `src/components/ui/ModalAppElement/`) e fica inerte com um diálogo
  aberto; título ligado por `aria-labelledby`; foco preso no diálogo e devolvido ao botão de
  origem ao fechar. Os toasts ficam fora do contêiner, para continuarem anunciados.
- **`react-select`** (Select): rótulo associado pelo `inputId` dentro de um `FormItem`.
  Múltiplo (`isMulti`, #319): cada valor tem o botão "Remover <opção>"; pelo teclado, Enter
  adiciona, Backspace remove o último e as setas para a esquerda e a direita focam um valor
  (com anel primary) para o Backspace remover; a região viva anuncia seleção, remoção e guias
  em pt-BR (`ariaLiveMessages` e `screenReaderStatus` do chamador vencem).
  Dropdown e Tooltip acessíveis por teclado (setas, Esc com o foco de volta).
- **Auditoria:** a vitrine `/teste-de-componentes` (`src/app/(admin)/teste-de-componentes/`,
  só com `E2E_ERROR_ROUTE`, no compose local) é onde se audita cada componente: todo componente
  novo ou portado ganha uma seção ali, e o E2E `test/e2e/components.spec.ts` o confere com axe
  (WCAG 2.2 AA) e teclado nos dois temas. Corrija no componente, não na tela.

## Padrões de tela

- **Menu "Mais ações":** o `Dropdown` do Ecme (`src/components/ui/Dropdown/`), para as ações
  secundárias de uma linha de tabela quando não cabem sem aumentar a altura dela; a ação
  principal da linha fica visível, fora do menu. O nome acessível leva o item ("Mais ações:
  exemplo-a"); os itens são `Dropdown.Item` (links por `asElement={Link}`), com o item da
  linha em `sr-only` quando o texto visível não o diz. O Dropdown abre, fecha (clique fora e
  Esc), navega por setas e devolve o foco ao gatilho.
- **Botão de ícone:** `IconButton` (`src/components/shared/IconButton.tsx`), sobre o `Button`
  (`plain`, `xs`: 32 px, acima do mínimo de 24 px) e o `Tooltip` do Ecme, para ações repetidas
  e compactas, como os controles de cada bloco do editor. O nome vem de `label` (`aria-label`,
  com a posição: "Mover bloco 3 para cima"); a dica é só visual e repete o nome, então o botão
  descarta o `aria-describedby` do Tooltip; o ícone (`react-icons/pi`, 16 px) fica
  `aria-hidden`. Ação indisponível que deve continuar focável (o foco fica no botão depois de
  mover) usa `aria-disabled`, desenhado como indisponível (opacidade e cursor), e o `onClick`
  confere a condição; `disabled` só quando o foco não precisa ficar no botão.
- **Diálogo de grade de miniaturas:** `MediaPicker` (`src/components/media/MediaPicker.tsx`), no
  `Dialog` do Ecme. Um `Button` (`type="button"`, porque fica dentro de formulários, com
  `aria-haspopup="dialog"`) abre o diálogo controlado. Dentro ficam o título "Escolher imagem"
  (`h2` em `aria-labelledby`, com `closable={false}` e o "Fechar" ao lado) e a página de
  miniaturas vinda de `load(page)` (a Server Action da leitura paginada), cada uma um botão
  comum "Mídia N · L×A". Abaixo vêm a `Pagination` (`nav "Paginação"`, pontas desabilitadas,
  `aria-current="page"`) e "Página X de Y · N imagens" em `role="status"` (também carregando,
  erro e vazio). A paginação só aparece depois da primeira página lida. Enquanto a próxima
  carrega, a grade anterior continua na tela, para o foco não se perder, e só a resposta mais
  recente vale. Escolher chama `onSelect(id)` e fecha; Esc, o fundo e "Fechar" fecham sem
  escolher. A miniatura é a `MediaThumbnail` (`src/components/media/MediaLibrary.tsx`), a mesma da
  biblioteca.
- **Detalhes da imagem:** `MediaDetails` (`src/components/media/MediaDetails.tsx`): na biblioteca,
  cada imagem é um botão (`aria-haspopup="dialog"`) com a miniatura e a legenda "<nome> ·
  <data>", que abre o `Dialog` do Ecme, como o `MediaPicker`: nome no `h2`, miniatura e um
  `<dl>` com dimensões, formatos disponíveis, identificador e data de envio. "Copiar
  identificador" usa `navigator.clipboard.writeText` e confirma em `role="status"`
  ("Identificador copiado."); a falha (sem contexto seguro, permissão negada) mostra o
  identificador na mesma região, em `text-error`. Esc, o fundo ou "Fechar" fecham, e o foco
  volta à imagem.
- **Tabelas:** a `Table` do Ecme (`src/components/ui/Table/`) com TanStack Table 9 (colunas
  com `createColumnHelper` e `tableFeatures`); a biblioteca traz skills em
  `node_modules/@tanstack/react-table/skills/`. Tabela sem interação (só leitura: fila de
  revisão, pendências, versões) é Server Component, sem `'use client'`: monta a instância com
  `constructTable` e `coreReactivityFeature: storeReactivityBindings()` (de
  `@tanstack/table-core/store-reactivity-bindings`) e desenha com `flexRender`. Tabela com
  busca, filtro, ordem, paginação ou ação na linha é cliente e usa `useTable`.
  Linha de tabela densa (lista de sites): no máximo duas linhas por célula, a principal e a
  secundária em `text-xs` (ex.: nome com `id · domínio` embaixo); texto longo é cortado
  (`truncate` com `max-w-*`) com o inteiro em `title`, em vez de quebrar. A ação principal da
  linha fica visível e as demais vão para o menu "Mais ações"; o retorno de uma ação vai para
  uma região `role="status"` da tabela, nunca para a linha. A lista de sites não rola na
  horizontal a 1280px, nem no contêiner da tabela.
- **Lista filtrada:** busca, filtros, ordenação e paginação no cliente, com o estado na URL.
  `useListState` (`src/components/shared/useListState.ts`) lê e grava `q` (busca), um parâmetro por
  filtro, `ordem` (id da coluna, com `-` na frente se decrescente) e `pagina` com
  `router.replace` (sem entrada no histórico por tecla); valor padrão não aparece na URL e
  parâmetro inválido cai no padrão. A tabela usa `listFeatures` e recebe `list.table` no
  `useTable`. A busca ignora maiúsculas e acentos (`normalizeText`) e só olha as colunas com
  `enableGlobalFilter`; mudar a busca ou um filtro volta à página 1. Controles de
  `src/components/shared/ListControls.tsx`, nos componentes do Ecme: `ListToolbar` acima da tabela
  (busca no `Input` com rótulo visível do que procura, um `Select` por filtro com "Todos", e
  "Limpar filtros" só com algo ativo); `SortableHead` no lugar do `Th` de coluna ordenável
  (`aria-sort` no `th` e o sentido no nome do botão); e `ListPagination` abaixo, com a contagem
  em `role="status"` ("N resultados") e a `Pagination` do Ecme. Nas listas atuais, a página tem
  25 itens fixos (`PAGE_SIZE`), sem seletor. O `DataTable` do Ecme
  (`src/components/shared/DataTable.tsx`) traz o seletor de tamanho: a lista que declara
  `pageSizes` na `ListConfig` grava o tamanho em `por-pagina` (padrão 25, fora da URL), e mudar
  o tamanho volta à página 1.
- **Datas:** `formatDateTime(data, fuso)` de `src/components/shared/siteLabels.ts`, sempre com o fuso
  do site (`SiteSummary.timeZone`, da configuração corrente), nunca o do navegador nem um fixo:
  "01/10/2026, 09:00 BRT" (dia, mês, ano, hora e minuto, com a sigla ou o deslocamento, como
  "GMT+1" em Lisboa). Telas de um site usam `site.timeZone`; a lista de sites mostra cada linha
  no fuso do próprio site. Componente cliente recebe o fuso por prop, para o texto sair igual
  no servidor e no navegador.
- **Estados:** a `Tag` do Ecme com o texto do estado e um ponto na cor dele (`prefixClass`,
  pelo `StateTag` de `src/components/sites/SiteStatus.tsx`), sem ícone; o texto fica no cinza da
  Tag e é o que distingue os estados sem cor. O mapa fica ao lado dos rótulos, em
  `src/components/shared/siteLabels.ts` (`CONTENT_STATUS_TAG`, `SITE_STATE_VARIANT`,
  `BUILD_STATUS_VARIANT`, tipados por `StateTagColor`); nunca escreva a cor de um estado na
  tela. O `siteLabels.test.ts` reprova dois estados do mesmo grupo com a mesma cor.
  - Conteúdo: rascunho `bg-gray-400`, em revisão `bg-warning`, aprovado `bg-info`, agendado
    `bg-primary-mild`, publicado `bg-success`, despublicado `bg-error`.
  - Site: ativo `bg-success`, promovendo `bg-info`, pausado `bg-warning` (com o motivo no texto
    e no `title`, sempre visível na lista de sites).
  - Build: publicado `bg-success`, falhou `bg-error`.
- **Sequência de etapas:** `LifecycleSteps` (`src/components/sites/LifecycleSteps.tsx`) para um
  processo de ordem fixa (ciclo de vida do site), não tag: `<ol>` com número, rótulo e o
  estado em texto ("concluída", "atual", "pendente"), além do estilo; a atual leva
  `aria-current="step"`. A ordem vem de `LIFECYCLE_ORDER` em `siteLabels.ts`. A ação manual
  fica no item da etapa que ela conclui e o retorno em `role="status"` abaixo da lista
  (`LifecycleActionScope`), que sobrevive à revalidação que move o botão de item.
- **Estado vazio:** `EmptyState` (`src/components/shared/EmptyState.tsx`) no lugar da tabela sem
  linhas, nunca uma tabela só com cabeçalho: a mensagem ("Nenhum autor cadastrado.") e, com
  permissão, a mesma ação principal do cabeçalho (`emptyAction` das tabelas). Com a lista
  vazia, a ação aparece duas vezes; no E2E, clique na primeira (a do cabeçalho).
- **Telas de estado:** `StatusScreen` (`src/components/shared/StatusScreen.tsx`), com título (`h1`),
  uma frase do que aconteceu e o que fazer, e a ação de saída (link de volta ou "Tentar de
  novo"). "Não encontrado" (`(admin)/not-found.tsx`, também para endereços sem rota, pelo
  catch-all `(admin)/[...rest]` e para o site inexistente), erro (`(admin)/error.tsx` e
  `global-error.tsx`, pelo `ErrorScreen`) e falta de permissão (`ForbiddenScreen`) a usam,
  mudando só o conteúdo, sem variante visual. A tela de erro nunca mostra a mensagem da
  exceção, só o `digest`.
- **Formulários:** gerados do schema Zod com `SchemaForm` (`src/components/forms/`), sobre
  react-hook-form + zodResolver; a validação é só a do schema. Visual do Ecme: cada campo num
  `FormItem` (rótulo e erro ligados ao controle), texto e número no `Input`, booleano no
  `Checkbox`, botões no `Button` e as seções em `Card`. O gerador desenha texto, número,
  booleano, enum, objeto (`fieldset`) e lista de objetos (adicionar e remover).
  Rótulos e dicas por caminho (`items.*.question`); `hidden` para o que é do servidor
  (`n`, `type`). O que o schema sozinho não descreve (rich text, seletor de mídia ou de
  entidade) entra por `fields`, um campo registrado por caminho, com `*` no lugar dos
  índices, que recebe `id`, `label`, `value`, `onChange`, `invalid` e `describedBy` (ligue
  esses dois ao controle). Nó sem desenho e sem campo registrado aparece como aviso.
  O `onSubmit` pode devolver a recusa do servidor (`{ path, message }[]`): com `path`, vira
  erro do campo; sem, vai para o resumo. Lista vazia em campo opcional (rich text apagado) é
  enviada como ausente. O resumo (`role="alert"`, sempre montado) sai de `formState.errors`:
  um item por campo inválido, "<rótulo>: <mensagem>", com a posição em cada lista
  ("Pergunta (pergunta 2)"), na ordem do schema, e acompanha a correção. Cada item é um botão
  que leva o foco ao campo (`setFocus`; campo registrado precisa ligar o `ref`); o erro da
  lista inteira vem sem botão. A recusa do servidor sem `path` aparece acima da lista.
  Formulário longo (a configuração do site) passa `sections` (`{ id, title, paths }`, chaves
  de topo): cada seção vira `<section>` com `h2` (`#secao-<id>`), todas na mesma página, sem
  abas, com um índice de âncoras no topo (`nav` "Seções do formulário"). Chave de topo fora
  de todas as seções aparece depois delas; sem `sections`, uma coluna só. Durante o envio o
  botão fica desabilitado e mostra `pendingLabel` ("Salvando…" por padrão; "Cadastrando…",
  "Criando…", "Aprovando…" por quem chama), sem segundo envio. Quem fica na tela confirma
  devolvendo `{ success: mensagem }`: o texto aparece ao lado do botão, numa região
  `role="status"` em `text-success`, e some no próximo envio. Quem sai da tela confirma no
  destino: o cadastro de site vai para `/sites?cadastrado=<id>`, e a tabela anuncia na região
  do topo depois de montar e tira a marca da URL (como o `?criado=1` do conteúdo).
  Dentro de um formulário maior (`FormProvider`), `SchemaFields` desenha um schema sob um
  prefixo (`blocks.2`), com os caminhos completos no registro (`blocks.*.content`): é como o
  editor de conteúdo monta cada bloco, com o rodapé de ações no `StickyFooter`. Referências do
  site: `mediaField(source)` (miniatura do valor atual lida por ID, "Escolher imagem"/"Trocar"
  pelo `MediaPicker` e, com `{ optional: true }` para capa e avatar, "Remover"; `source` são as
  actions da leitura paginada e por IDs ligadas ao site pela página) e
  `entityField(opções, aviso)` (caixas de seleção para `authorIds` e `taxonomyIds`), em
  `src/components/forms/PickerFields.tsx`. Campos registrados recebem `ref` (ligue ao controle
  focável, para o foco do erro chegar) e `readOnly` (caminhos em `readOnly`). Para listas de
  texto, feature flags e opções de `RESOURCES`: `linesField`, `flagsField` e `choiceField`
  (`src/components/forms/SiteFields.tsx`). Nenhum formulário é escrito à mão: o da
  configuração do site também usa o gerador (#47).
- **Rich text:** TipTap só com o que o `RichTextSchema` aceita (`src/components/forms/`).
  Registre `richTextField('richText')` para texto e textos institucionais, e
  `richTextField('inlines')` (um parágrafo, sem intertítulo nem lista) para citação, resposta
  de FAQ e legenda. O valor é sempre a árvore do content-model; colar HTML descarta o que o
  schema não aceita, e link com endereço inválido vira texto.

## Testes

- **Testes de componente:** `*.test.tsx` com `// @vitest-environment happy-dom` e Testing
  Library (rótulos por `getByLabelText`, teclado por `user-event`). Seletor por role e nome;
  nada de `data-testid`. Asserção de classe só para cor de estado.
- **E2E:** Playwright com axe nas telas (`test/e2e/`), e a vitrine para cada componente (ver
  Acessibilidade).
