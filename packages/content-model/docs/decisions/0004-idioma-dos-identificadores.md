# 0004 – Estrutura em inglês, valores de configuração em português

- Status: aceito
- Data: 2026-09-29

## Contexto

Os identificadores do contrato são versionados: trocar um nome depois é mudança
incompatível. A entrada misturava idiomas: tipos de linha do snapshot em inglês
(`config`, `author`…), a flag `indexavel` e os tipos de página (`artigo`, `categoria`,
`autor`) em português.

## Decisão

- **Estrutura** (nomes de campos, `type` de blocos e linhas, `kind`): inglês. Ex.:
  `title`, `slug`, `authorIds`, blocos `text`, `toc`, `quote`, `image`, `faq`,
  taxonomias `category`, `tag`, `series`.
- **Valores escolhidos na configuração do site**: português. Ex.: tipos de página
  `home`, `artigo`, `categoria`, `autor`; preset `padrao`; variantes `vertical`,
  `horizontal`.
- `indexavel` fica como exceção: a entrada e o glossário da raiz já o fixaram.

## Alternativas consideradas

- Tudo em inglês (`indexable`, `article`): contrariava a entrada e o glossário.
- Tudo em português (`titulo`, `autorId`): divergia dos tipos de linha da L1 e misturava
  idiomas com a API do Zod e do TypeScript.

## Consequências

- Componentes com variante usam nome estrutural em inglês (`articleCard`), e as
  variantes, valores em português.
- Termo novo: siga a mesma divisão, ou registre a exceção aqui.
