#!/usr/bin/env sh
# Ciclo de vida das worktrees de trabalho em paralelo (ADR 0003): criar, remover e varrer.
#
# pnpm worktree new <id> [branch]  cria <pasta>/<repo>-<id> a partir da branch (local, remota ou
#                                  nova sobre origin/main), copia o .worktreeinclude e instala
# pnpm worktree rm <id|caminho>    remove a worktree e a branch local, só se nada se perder
# pnpm worktree gc [--dry-run]     remove as worktrees cujo trabalho acabou (PR mergeado ou
#                                  fechado, ou só commits da main e parada há 24 h); roda no
#                                  SessionStart do Claude Code
# pnpm worktree list               lista as worktrees
#
# <pasta> é ORAKEL_WORKTREES_DIR, ou `.worktrees` ao lado do checkout principal: as cópias
# ficam fora do repositório (lint, Prettier e Vitest não as veem) e todas no mesmo lugar.
# "Nada se perde" = árvore limpa (sem mudança nem arquivo novo fora do .gitignore) e nenhum
# commit fora de um remoto. O gc também poupa a worktree que é o cwd de algum processo.
set -eu

main="$(dirname "$(git -C "$(dirname "$0")" rev-parse --path-format=absolute --git-common-dir)")"
cd "$main"
root="${ORAKEL_WORKTREES_DIR:-$(dirname "$main")/.worktrees}"
base="$(basename "$main")"
quiet=0

say() { [ "$quiet" = 1 ] || echo "$@"; }

usage() {
  echo "uso: pnpm worktree new <id> [branch] | rm <id|caminho> | gc [--dry-run] [--quiet] | list" >&2
  exit 2
}

# Caminho da worktree a partir do id (566) ou de um caminho.
resolve() {
  case "$1" in
    */*) (cd "$1" 2>/dev/null && pwd -P) || echo "$1" ;;
    *) echo "$root/$base-$1" ;;
  esac
}

# Motivo para não remover, ou vazio quando nada se perde.
unsafe_reason() {
  if [ -n "$(git -C "$1" status --porcelain 2>/dev/null)" ]; then
    echo "há mudanças não commitadas"
  elif [ -n "$(git -C "$1" rev-list -1 HEAD --not --remotes 2>/dev/null)" ]; then
    echo "há commits que não estão em nenhum remoto"
  fi
}

# Algum processo com cwd dentro da worktree (uma sessão aberta nela)?
in_use() {
  lsof -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | awk -v d="$1" '$0 == d || index($0, d "/") == 1 { f = 1 } END { exit !f }'
}

remove() {
  dir="$1"
  branch="$(git -C "$dir" branch --show-current 2>/dev/null || true)"
  git worktree remove "$dir"
  if [ -n "$branch" ] && git show-ref --verify --quiet "refs/heads/$branch"; then
    # Seguro: unsafe_reason já garantiu que todos os commits da branch estão num remoto.
    git branch -D "$branch" >/dev/null
  fi
  say "removida: $dir${branch:+ (branch $branch)}"
}

cmd_new() {
  [ $# -ge 1 ] || usage
  id="$1"
  case "$id" in
    *[!A-Za-z0-9._-]* | -*) echo "id só com letras, dígitos, ponto, hífen e sublinhado: $id" >&2; exit 2 ;;
  esac
  dir="$root/$base-$id"
  if [ -e "$dir" ]; then
    echo "$dir"
    exit 0
  fi
  git fetch --quiet origin
  mkdir -p "$root"
  if [ $# -ge 2 ]; then
    branch="$2"
    if git show-ref --verify --quiet "refs/heads/$branch"; then
      git worktree add --quiet "$dir" "$branch"
    elif git show-ref --verify --quiet "refs/remotes/origin/$branch"; then
      git worktree add --quiet --track -b "$branch" "$dir" "origin/$branch"
    else
      git worktree add --quiet --no-track -b "$branch" "$dir" origin/main
    fi
  else
    git worktree add --quiet --detach "$dir" origin/main
  fi
  # Arquivos fora do git que a worktree precisa (ex.: .env.local), copiados sem ler o conteúdo.
  if [ -f .worktreeinclude ]; then
    grep -v -e '^[[:space:]]*#' -e '^[[:space:]]*$' .worktreeinclude | while IFS= read -r file; do
      [ -f "$file" ] || continue
      mkdir -p "$dir/$(dirname "$file")"
      cp -p "$file" "$dir/$file"
    done
  fi
  (cd "$dir" && pnpm install --frozen-lockfile --prefer-offline --reporter=silent) >&2
  echo "$dir"
}

cmd_rm() {
  [ $# -eq 1 ] || usage
  dir="$(resolve "$1")"
  if [ "$dir" = "$main" ]; then
    echo "esse é o checkout principal; não se remove" >&2
    exit 2
  fi
  if ! git worktree list --porcelain | grep -qxF "worktree $dir"; then
    echo "não é uma worktree deste repositório: $dir" >&2
    git worktree prune
    exit 1
  fi
  reason="$(unsafe_reason "$dir")"
  if [ -n "$reason" ]; then
    echo "não removi $dir: $reason. Commite e envie (ou descarte) e rode de novo." >&2
    exit 1
  fi
  remove "$dir"
  git worktree prune
}

# PR da branch: MERGED, CLOSED, OPEN ou vazio (sem PR ou sem gh).
pr_state() {
  command -v gh >/dev/null 2>&1 || return 0
  gh pr list --head "$1" --state all --limit 1 --json state --jq '.[0].state // empty' 2>/dev/null || true
}

cmd_gc() {
  dry=0
  for arg in "$@"; do
    case "$arg" in
      --dry-run) dry=1 ;;
      --quiet) quiet=1 ;;
      *) usage ;;
    esac
  done
  # Uma varredura por vez (várias sessões podem começar juntas); mkdir é atômico.
  lock="${TMPDIR:-/tmp}/orakel-worktree-gc.$(printf '%s' "$main" | cksum | cut -d' ' -f1)"
  if ! mkdir "$lock" 2>/dev/null; then
    # Trava esquecida por uma varredura que morreu: vale por 10 minutos.
    if [ -n "$(find "$lock" -maxdepth 0 -mmin +10 2>/dev/null)" ]; then
      rmdir "$lock" 2>/dev/null || true
      mkdir "$lock" 2>/dev/null || exit 0
    else
      say "outra varredura em andamento"
      exit 0
    fi
  fi
  trap 'rmdir "$lock" 2>/dev/null || true' EXIT INT TERM

  git worktree prune
  git fetch --quiet --prune origin 2>/dev/null || say "aviso: sem fetch; uso as refs locais"

  git worktree list --porcelain | sed -n 's/^worktree //p' | while IFS= read -r dir; do
    [ "$dir" != "$main" ] || continue
    [ -d "$dir" ] || continue
    reason="$(unsafe_reason "$dir")"
    if [ -n "$reason" ]; then
      say "mantida: $dir ($reason)"
      continue
    fi
    if in_use "$dir"; then
      say "mantida: $dir (em uso por um processo)"
      continue
    fi
    branch="$(git -C "$dir" branch --show-current)"
    done_why=""
    if [ -n "$branch" ]; then
      case "$(pr_state "$branch")" in
        MERGED) done_why="PR mergeado" ;;
        CLOSED) done_why="PR fechado" ;;
      esac
    fi
    # Sem PR concluído e sem nada além da main: recém-criada (a sessão ainda não commitou) ou
    # abandonada. Só a abandonada sai: 24 h sem commit nem checkout (logs/HEAD).
    if [ -z "$done_why" ] && git merge-base --is-ancestor "$(git -C "$dir" rev-parse HEAD)" origin/main 2>/dev/null &&
      [ -n "$(find "$(git -C "$dir" rev-parse --absolute-git-dir)/logs/HEAD" -mmin +1440 2>/dev/null)" ]; then
      done_why="já está na main e parada há mais de 24 h"
    fi
    if [ -z "$done_why" ]; then
      say "mantida: $dir (trabalho em andamento)"
      continue
    fi
    if [ "$dry" = 1 ]; then
      say "removeria: $dir ($done_why)"
    else
      remove "$dir" || say "falhou ao remover: $dir"
    fi
  done
  [ "$dry" = 1 ] || git worktree prune
}

[ $# -ge 1 ] || usage
verb="$1"
shift
case "$verb" in
  new) cmd_new "$@" ;;
  rm) cmd_rm "$@" ;;
  gc) cmd_gc "$@" ;;
  list) git worktree list ;;
  *) usage ;;
esac
