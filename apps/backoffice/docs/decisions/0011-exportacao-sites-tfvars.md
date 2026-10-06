# 0011 – Exportação do sites.auto.tfvars.json

- Status: aceito
- Data: 2026-10-06

## Contexto

A lista de sites do OpenTofu (`infra/sites.auto.tfvars.json`) tem um único gerador: a
exportação do módulo Sites do Backoffice (entrada, 0001). A raiz do OpenTofu só chega na fase 1,
mas o arquivo precisa existir desde já, gerado a partir do registro (workspace#16).

## Decisão

- **Formato:** um objeto `sites` mapeado por SITE_ID, pronto para `for_each`; cada site tem
  `domains`, na ordem da configuração corrente (o principal primeiro):

  ```json
  {
    "sites": {
      "exemplo-a": { "domains": ["a.example.com", "www.a.example.com"] }
    }
  }
  ```

- **Quais sites:** todos os do registro, em qualquer etapa do ciclo de vida.
- **Estabilidade:** sites em ordem de SITE_ID, ordenados no código e não pela collation do
  banco. JSON com indentação de 2 espaços e quebra de linha no fim. O mesmo registro gera os
  mesmos bytes, e o diff no repositório da infraestrutura mostra só o que mudou.
- **Acesso:** `GET /sites/tfvars`, na área autenticada, gerado a cada pedido (`no-store`) e
  baixado como `sites.auto.tfvars.json`. Exige `site.configure` (admin e operação); a recusa
  vira `403`. Não passa pela `/api/export`, que é só da rede interna.
- **Evolução:** campos novos por site (zona, conta…) entram de forma aditiva, registrados
  aqui, quando a raiz do OpenTofu precisar.

## Alternativas consideradas

- **Lista em vez de objeto:** `for_each` exige mapa ou conjunto; com uma lista, o endereço de
  cada recurso dependeria da posição, e um site novo no meio recriaria os seguintes.
- **Gerar na `/api/export`:** essa API é da rede interna, para o build; a operação baixa o
  arquivo pelo navegador.
- **Gravar o arquivo a cada mudança de site:** criaria um segundo estado que pode ficar
  desatualizado em relação ao registro.

## Consequências

- Versionar o arquivo e rodar `tofu plan`/`apply` continua sendo passo manual da operação.
- Se um site for cadastrado sem configuração, ele sai com `domains: []`. Pelo fluxo atual
  isso não acontece, porque o cadastro grava site e configuração na mesma transação.
