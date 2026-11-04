#!/usr/bin/env sh
# pnpm local:trust: instala no Keychain do sistema (macOS) ou no NSS do usuário (Linux, onde o
# Chrome e o Chromium leem a confiança) a raiz da CA interna do Caddy que está em uso, e remove
# as raízes antigas dele. A raiz muda quando o volume caddy-data é recriado (pnpm local:reset);
# todas têm o mesmo nome, por isso a troca é pela impressão digital. No macOS, pede a senha
# (sudo).
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
  # Linux: o Chrome e o Chromium leem a confiança do NSS do usuário, não do sistema.
  if ! command -v certutil >/dev/null 2>&1; then
    echo "Fora do macOS, o comando usa o certutil (pacote libnss3-tools no Debian e no Ubuntu)." >&2
    echo "Sem ele, importe a raiz no navegador como autoridade:" >&2
    echo "  infra/local/compose.sh cp caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt" >&2
    exit 1
  fi
  nssdb="sql:$HOME/.pki/nssdb"
  if [ ! -f "$HOME/.pki/nssdb/cert9.db" ]; then
    mkdir -p "$HOME/.pki/nssdb"
    certutil -d "$nssdb" -N --empty-password
  fi
  # Cada raiz do Caddy vai com o apelido caddy-local-<impressão digital>.
  found=""
  for nick in $(certutil -d "$nssdb" -L | sed -n 's/^\(caddy-local-[0-9A-F]*\) .*/\1/p'); do
    if [ "$nick" = "caddy-local-$current" ]; then
      found=1
    else
      echo "Removendo a raiz antiga $nick…"
      certutil -d "$nssdb" -D -n "$nick"
    fi
  done
  if [ -n "$found" ]; then
    echo "A raiz em uso já está no NSS ($HOME/.pki/nssdb)."
  else
    echo "Instalando a raiz em uso no NSS ($HOME/.pki/nssdb)…"
    certutil -d "$nssdb" -A -t C,, -n "caddy-local-$current" -i "$cert"
  fi
  echo "Pronto. Feche o Chrome por completo e abra de novo."
  exit 0
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
