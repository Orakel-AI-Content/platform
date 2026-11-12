# 0026 – local:publish pelo Backoffice

- Status: aceito (revisa o `pnpm local:publish` da 0015)
- Data: 2026-11-12

## Contexto

A ADR 0015 definiu o `pnpm local:publish <site>` como `render` e `publish` da imagem
`site-builder` rodados à mão, com `docker run` nas redes `orakel-export` e `orakel-publish`,
"como o `build-runner` fará". O `build-runner` já faz isso desde a L3, e o atalho virou um
caminho paralelo: não grava a execução em `builds` nem atualiza `sites.active_version_id`.
Depois de um `local:publish`, o site está no ar no `edge-local`, mas o Backoffice mostra outra
versão ativa e não tem a publicação no histórico (workspace#86).

## Decisão

- O comando continua existindo, com o mesmo nome e argumento, e passa a pedir o build ao
  Backoffice: `infra/local/publish.sh` só repassa a chamada ao script `site:publish` do
  `@orakel/backoffice` (`src/bin/publish.ts`), no molde do `db:seed`.
- O script chama a `requestBuildNow` com o ator `system`, a mesma função do botão "Publicar
  agora": o job `build:<site>` vai para a fila para rodar já, com as mesmas recusas (site
  inexistente ou pausado). Quem roda `render` e `publish` é o `build-runner`.
- O script acompanha as tentativas do job em `builds` até o resultado final: sai com 0 no
  `ok`; sai com 1 e o motivo gravado (etapa e `failureMessage`) na falha permanente, na falha
  da última tentativa ou no cancelamento. Falha transitória com tentativa restante só é
  mostrada, e a espera continua até a repetição fechar. Limite de 20 minutos.

## Alternativas consideradas

- **Remover o comando:** o fluxo pelos botões já publica, mas o atalho no terminal serve a quem
  trabalha sem abrir o Backoffice (inclusive sessões em worktree). Mantido, reescrito.
- **Manter o `docker run` e gravar em `builds` no fim:** duplicaria a lógica do `build-runner`
  (plano, trava de segurança, versão ativa) num script de shell.
- **Chamar a rota HTTP do botão:** exigiria sessão do access-mock e não acrescenta nada à mesma
  função de domínio.

## Consequências

- Toda publicação local aparece no histórico do site e atualiza a versão ativa, como a da VPS.
- O comando depende do Postgres e do `build-runner` de pé (`pnpm local:up`): sem o banco, sai
  com 1 na hora; sem o `build-runner`, o build fica na fila e o comando sai com 1 no limite.
- O script roda no host, com o `.env.local` (como o `db:seed`), e não chama o Docker.
