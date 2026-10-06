# 0010 – Janela de agrupamento dos builds por site

- Status: aceito (completa o disparo do 0008)
- Data: 2026-10-06

## Contexto

O 0008 agenda o build com uma janela global (`BUILD_WINDOW_SECONDS`, 900 em produção e 30 no
local), aplicada na partida de cada processo. A Story de cadastro e ciclo de vida dos sites
(workspace#16) pede intervalos diferentes por site, por exemplo 30 s em um e 2 min em outro.

## Decisão

- Coluna operacional `sites.build_window_seconds` (inteiro, nula, `check >= 0`), fora da
  `SiteConfig` e do snapshot. Nula usa `BUILD_WINDOW_SECONDS`, e `0` agenda para já.
- `scheduleBuild` lê a coluna na transação da gravação, a cada agendamento. A ordem de
  precedência é `windowMs` explícito, depois a janela do site, depois a global.
- A operação define ou limpa a janela pela ação `setBuildWindow` (`site.configure`), em
  `site-state.ts`, sem mudança pendente.
- A janela nova vale da próxima publicação em diante: um job já agendado mantém o `run_at`
  (`preserve_run_at`).

## Alternativas consideradas

- **Janela na `SiteConfig`:** iria para o snapshot, e cada ajuste geraria uma mudança pendente
  e um build sem nada a publicar.
- **Janelas carregadas na partida do processo:** a mudança só valeria depois de reiniciar o
  web e o worker.
- **Regravar o job agendado ao mudar a janela:** misturaria a regra com o "Publicar agora"
  (`replace`) e com o agrupamento (`preserve_run_at`).

## Consequências

- Cada publicação faz um `select` a mais por chave primária, na mesma transação.
- A tela da página do site (workspace#16) usa `setBuildWindow`. Ainda não há limite máximo
  para a janela.
