#!/usr/bin/env sh
# PostToolUse (Edit|Write): formata com Prettier o arquivo editado. Nunca bloqueia.
file=$(jq -r '.tool_input.file_path // empty')
[ -n "$file" ] && [ -f "$file" ] || exit 0
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
pnpm exec prettier --write --ignore-unknown --log-level warn "$file" >/dev/null 2>&1 || true
