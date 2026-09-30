# 0003 – Dados: IDs por site, versões imutáveis e mudanças pendentes

- Status: aceito
- Data: 2026-09-29

## Contexto

Tudo pertence a um único site. O ID do artigo e o número do bloco entram no identificador
de reconciliação de afiliados (`s{site}a{artigo}b{bloco}`), que já inclui o site. As
fixtures do `content-model` usam IDs por site (os dois sites têm autor `1`).

## Decisão

- Entidades de conteúdo com chave `(site_id, id)`; IDs alocados por `site_sequences`
  (`allocateId`), estáveis e nunca reutilizados. A importação reserva IDs explícitos e
  mantém a sequência acima deles.
- `contents` guarda o próximo número de bloco (acima do maior `n` usado);
  `content_versions` guarda cada versão imutável, com status e os dados do conteúdo
  (JSON no formato do `content-model`, sem o ID).
- Configuração do site versionada em `site_configs` (a corrente é a de maior versão).
- `recordPendingChange(tx, site, origem, referência)` em toda gravação exportada; o teste
  de varredura (`coverage.test.ts`) impede esquecer.
- Drizzle sobre `pg`, um pool por processo compartilhado com o Graphile Worker; o schema
  `graphile_worker` é migrado pelo próprio Graphile no `db:migrate`.
- Migrações SQL geradas pelo `drizzle-kit` em `drizzle/`, só aditivas.

## Alternativas consideradas

- IDs globais (serial): o snapshot não reproduziria as fixtures, e o ID do artigo deixaria
  de ser pequeno e legível no identificador de reconciliação.

## Consequências

`authorIds` e `taxonomyIds` ficam dentro da versão do conteúdo (versionados com ele); a
tabela de relações entra se o painel precisar consultar por taxonomia.
