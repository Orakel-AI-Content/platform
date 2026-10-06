#!/usr/bin/env sh
# pnpm local:trust: instala no Keychain do sistema (macOS) a raiz da CA interna do Caddy que
# está em uso, e remove as raízes antigas dele. A raiz muda quando o volume caddy-data é
# recriado (pnpm local:reset); todas têm o mesmo nome, por isso a troca é pela impressão
# digital. Pede a senha (sudo).
set -eu
cd "$(dirname "$0")/../.."
. infra/local/lib.sh

keychain=/Library/Keychains/System.keychain
name="Caddy Local Authority"
cert=$(mktemp -t caddy-root.XXXXXX)
trap 'rm -f "$cert"' EXIT

compose exec -T caddy cat /data/caddy/pki/authorities/local/root.crt >"$cert"
current=$(openssl x509 -in "$cert" -noout -fingerprint -sha256 | sed 's/.*=//; s/://g')
echo "Raiz em uso: $(openssl x509 -in "$cert" -noout -subject | sed 's/.*CN *= *//') ($current)"

if ! command -v security >/dev/null 2>&1; then
  echo "Fora do macOS, importe a raiz no navegador como autoridade:" >&2
  echo "  infra/local/compose.sh cp caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt" >&2
  echo "  certutil -d sql:\$HOME/.pki/nssdb -A -t C,, -n caddy-local -i ./caddy-root.crt   # Chrome no Linux" >&2
  exit 1
fi

installed=$(security find-certificate -a -c "$name" -Z "$keychain" 2>/dev/null | sed -n 's/^SHA-256 hash: //p')
for hash in $installed; do
  if [ "$hash" != "$current" ]; then
    echo "Removendo a raiz antiga $hash…"
    sudo security delete-certificate -Z "$hash" "$keychain"
  fi
done

case "$installed" in
  *"$current"*) echo "A raiz em uso já está instalada." ;;
  *)
    echo "Instalando a raiz em uso…"
    sudo security add-trusted-cert -d -r trustRoot -k "$keychain" "$cert"
    ;;
esac
echo "Pronto. Feche o Chrome por completo (⌘Q) e abra de novo."
