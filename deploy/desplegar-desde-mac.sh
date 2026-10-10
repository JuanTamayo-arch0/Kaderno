#!/usr/bin/env bash
# Publica desde tu Mac, sin pasar por GitHub (por ejemplo para probar algo rápido).
#   bash deploy/desplegar-desde-mac.sh            compila y publica
#   bash deploy/desplegar-desde-mac.sh rollback   vuelve a la versión anterior
#   bash deploy/desplegar-desde-mac.sh list       lista las versiones
#
# Necesita que la llave SSH de tu Mac esté autorizada para el usuario deploy
# (vuelve a correr droplet-setup.sh en el droplet con tu llave pública).
# El host se toma de KADERNO_HOST o del archivo deploy/.host (que no se sube a git).
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${KADERNO_HOST:-$(cat deploy/.host 2>/dev/null || true)}"
if [ -z "$HOST" ]; then
  read -r -p "IP o dominio del droplet: " HOST
  echo "$HOST" > deploy/.host
fi
PORT="${KADERNO_PORT:-22}"
SITE_URL="${SITE_URL:-https://testssecurelocal.website}"
SSH=(ssh -p "$PORT" -o BatchMode=yes "deploy@$HOST")

case "${1:-deploy}" in
  rollback) "${SSH[@]}" "rollback ${2:-}"; exit ;;
  list)     "${SSH[@]}" list; exit ;;
  deploy)   ;;
  *) echo "Uso: $0 [deploy|rollback [versión]|list]"; exit 1 ;;
esac

if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  echo "AVISO: tienes cambios sin commit; se publicará lo que hay en la carpeta."
fi
TAG="$(git rev-parse --short HEAD 2>/dev/null || echo local)"
[ -z "$(git status --porcelain 2>/dev/null)" ] || TAG="$TAG-mac"

echo "== Compilando versión web"
rm -rf dist
npx expo export --platform web --output-dir dist
test -f dist/index.html

echo "== Subiendo ($TAG) a $HOST"
# COPYFILE_DISABLE evita que el tar de macOS meta archivos ._* de metadatos.
COPYFILE_DISABLE=1 tar -czf - -C dist . | "${SSH[@]}" "deploy $TAG"

echo "== Comprobando $SITE_URL"
bash deploy/comprobar-sitio.sh "$SITE_URL" || {
  echo "La comprobación falló. Para volver atrás: bash deploy/desplegar-desde-mac.sh rollback"
  exit 1
}
