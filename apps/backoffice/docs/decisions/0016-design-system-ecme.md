# 0016 – Ecme como design system e layout do Backoffice

- Status: aceito
- Data: 2026-10-16

## Contexto

A interface do Backoffice foi montada tela a tela com shadcn/ui copiado (ADR 0001, "UI e
componentes"), primitivos nativos (`<dialog>`, Popover API, `<select>`) e tokens próprios em
`src/app/globals.css`. Não havia referência visual nem layout de aplicação: cada módulo novo
reinventa cabeçalho, navegação, cartões e estados.

A organização tem uma licença comercial do template **Ecme** (Themenate), publicado sem
alterações em `Orakel-AI-Content/design-reference` (v1.3.10, commit `3aa8b9f`). É a variante
Vite + React Router: React 19.2, Tailwind 4 configurado por `tailwind.config.cjs` legado,
zustand, `@floating-ui/react`, `react-modal`, `framer-motion`, `react-select`, react-i18next e
mocks com axios. O Backoffice é Next 16 com Server Components, Server Actions e Cloudflare
Access.

## Decisão

- O Ecme passa a ser o **design system e o layout** do Backoffice e a referência de design e de
  código de frontend para toda tela nova ou alterada.
- O Backoffice **continua em Next 16 (App Router)**. O Ecme é portado para dentro do app, como o
  shadcn hoje: o código é copiado em `src/components/` e ajustado. Não vira pacote: `packages/ui`
  é das ilhas dos sites.
- Adoção por inteiro, substituindo:
  - shadcn/ui e `components.json` (ADR 0001, "UI e componentes": continua valendo o resto da
    linha: TanStack Table, react-hook-form, formulários gerados do Zod, TipTap no bloco de texto);
  - a regra "sem Radix, só primitivos nativos" de `docs/design/design-system.md`: entram
    `@floating-ui/react`, `react-modal`, `framer-motion`, `react-select`, `simplebar-react`,
    `react-icons`, `classnames`, `dayjs` e o que mais o componente portado exigir, sempre pelo
    `catalog` da raiz;
  - os tokens OKLCH de `globals.css`: entram as cores, a fonte Inter, os raios e as classes de
    componente do Ecme, traduzidos para `@theme` nativo do Tailwind 4 (sem `@config`);
  - o tema escuro só por `prefers-color-scheme`: passa a ser por classe em `<html>`, com escolha
    da pessoa guardada em cookie e lida no servidor (sem flash na hidratação).
- Layout único: **CollapsibleSide** do Ecme (navegação lateral recolhível, header com perfil e
  tema). Os outros cinco layouts e o configurador de layout não são portados.
- Não muda:
  - WCAG 2.2 AA, com axe no E2E: um componente do Ecme que não passa é corrigido no porte;
  - sem biblioteca de i18n: textos em pt-BR direto no código (o i18next do Ecme fica de fora);
  - autenticação pelo Cloudflare Access (o `authStore`, o `AuthProvider` e as telas de login do
    Ecme ficam de fora); permissão pelo `can()` de `src/domain/access/rbac.ts`;
  - SchemaForm (formulários gerados do Zod), TanStack Table 9, estado de lista na URL,
    sem `loading.tsx`, datas no fuso do site.
- O porte segue `docs/migration/ecme.md`, que também é o contexto do épico de migração. Até o
  fim do épico, tela ainda não migrada segue `docs/design/design-system.md`.

## Alternativas consideradas

- **Trocar Next por Vite, como o template.** Exigiria uma API para tudo o que hoje é Server
  Component, Server Action e route handler, e refazer a autenticação. Muito custo para ganhar só
  a cópia literal das rotas do template.
- **Visual do Ecme sobre primitivos nativos.** Menos dependências e acessibilidade já testada,
  mas o código se afasta tanto do template que ele deixa de servir como referência de código.
- **Ecme com react-i18next.** O Backoffice tem um idioma só; a raiz decidiu sem i18n (ADR 0006).

## Consequências

- Dependências novas no `catalog`, e mais JS no cliente do Backoffice (ferramenta interna, sem o
  orçamento de JS dos sites).
- Quase todo componente portado precisa de `'use client'`; Server Components continuam lendo o
  domínio e passam dados por props.
- Asserções de classe nos testes unitários e alguns seletores do E2E (`[popover]`, `<dialog>`)
  mudam junto com cada tela; landmarks, nomes acessíveis, ordem do Tab e foco visível ficam.
- O teste de contraste de `globals.css` passa a valer para a paleta do Ecme; par abaixo de AA é
  ajustado.
- `docs/design/design-system.md` é reescrito no fim do épico. A licença do Ecme cobre o uso
  interno; o código portado não sai do repositório privado.
