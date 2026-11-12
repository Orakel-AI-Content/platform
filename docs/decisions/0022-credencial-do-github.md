# 0022 – Credencial do GitHub no build-runner

- Status: aceito (sem o PAT, o build-runner não sobe com o driver `github`: 0023)
- Data: 2026-11-11

## Contexto

"Gerar nova versão" (workspace#81) sai do Backoffice sem terminal: alguém precisa disparar o
`release.yml` (ADR 0018) com a versão e acompanhar o run até o fim. Isso exige uma credencial
do GitHub dentro da VPS. O pull da imagem pelo proxy (ADR 0021) é a outra metade e, com o
pacote privado, também precisaria de credencial.

## Decisão

- Só o `build-runner` tem a credencial, em `GITHUB_RELEASE_TOKEN` no `BuildRunnerEnvSchema`
  e só no serviço dele no `infra/vps/compose.yaml`. O web e o worker não a recebem; o pedido
  da operação vira um job `release-run`, que só o build-runner registra.
- A credencial é um PAT fine-grained (`github_pat_…`), restrito ao repositório do
  `release.yml` (`GITHUB_RELEASE_REPOSITORY`, padrão `Orakel-AI-Content/platform`), com
  **Actions: read and write** (disparar e ler o run) e **Contents: read**. O schema recusa PAT
  clássico.
- O cliente (`src/lib/github.ts`) é `fetch` puro com as duas chamadas usadas, no molde do
  `lib/docker.ts`. O token só vai no cabeçalho `Authorization`; nenhuma mensagem de erro, motivo
  gravado em `releases.failureReason` ou log o repete.
- O acompanhamento é o job se reagendando a cada 30 s pelo Graphile Worker, sem dormir no
  worker (concorrência 2, dividida com os builds). Rede, 5xx e limite de requisições repetem o
  job; 401/403/404/422 viram `falhou` com motivo legível.
- O pacote `site-builder` no GHCR é público: o pull (ADR 0021) não usa credencial, e o PAT não
  precisa de `packages:read`.
- Sem `GITHUB_RELEASE_TOKEN`, o build-runner sobe igual e a release pedida vai a `falhou` com
  o motivo. O ambiente local não usa GitHub (driver local, #662). Revisado pelo 0023: com
  `RELEASE_DRIVER=github` (padrão), o schema exige o PAT e o build-runner não sobe sem ele.

### Passos manuais

1. Tornar o pacote público: GitHub → organização `Orakel-AI-Content` → **Packages** →
   `site-builder` → **Package settings** → **Change visibility** → **Public**. Conferir com
   `docker logout ghcr.io && docker pull ghcr.io/orakel-ai-content/site-builder:<tag>`.
2. Criar o PAT: **Settings → Developer settings → Fine-grained tokens → Generate new token**,
   dono `Orakel-AI-Content`, só o repositório `platform`, permissões **Actions: Read and write**
   e **Contents: Read-only**, com validade (renovar antes de vencer).
3. Gravar `GITHUB_RELEASE_TOKEN` no ambiente da VPS e recriar só o `build-runner`.

## Alternativas consideradas

- GitHub App: token de curta duração e sem dono pessoal, mas exige app, chave privada e
  troca por token de instalação; decidido no refinamento usar PAT pelo tamanho do uso (um
  disparo por versão).
- Credencial no `backoffice-web`, disparando direto na ação: põe o segredo no processo exposto
  à internet e prende a requisição ao tempo do GitHub.
- Pacote privado com credencial de pull: mais um segredo (`packages:read`) e o daemon do host
  autenticado no GHCR; a imagem não tem nada que não esteja no repositório.
- Nome `GITHUB_TOKEN`: colide com o token que o GitHub Actions injeta e com o que muitos
  shells exportam para o `gh`, e o compose o repassaria ao build-runner local sem querer.

## Consequências

- Um vazamento do PAT permite disparar workflows e ler o conteúdo do `platform`, não
  escrever código nem publicar pacotes; o `release.yml` só sai da main e recusa versão já
  usada.
- O PAT expira: vencido, a release falha com "o GitHub recusou a credencial", e a correção é
  gerar outro e recriar o build-runner.
- Qualquer um pode baixar a imagem `site-builder`.
