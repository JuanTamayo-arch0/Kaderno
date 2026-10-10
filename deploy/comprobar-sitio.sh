#!/usr/bin/env bash
# Comprueba que el sitio publicado responde y que carga el JavaScript del build.
#   bash deploy/comprobar-sitio.sh https://testssecurelocal.website
set -euo pipefail
URL="${1:?Uso: comprobar-sitio.sh <url>}"
URL="${URL%/}"

for intento in 1 2 3 4 5; do
  if HTML="$(curl -fsSL --max-time 15 -H 'Cache-Control: no-cache' "$URL/?v=$(date +%s)")"; then
    JS="$(printf '%s' "$HTML" | grep -oE '/_expo/static/js/[^"]+\.js' | head -n1 || true)"
    if [ -z "$JS" ]; then
      echo "La página responde pero no referencia el bundle de Expo (intento $intento)"
    elif curl -fsS --max-time 30 -o /dev/null "$URL$JS"; then
      CFG="$(curl -fsS --max-time 15 "$URL/kaderno-config.js?v=$(date +%s)" || true)"
      if printf '%s' "$CFG" | grep -q "SUPABASE_URL: *''"; then
        echo "AVISO: kaderno-config.js del servidor está vacío; la app usará lo del build"
      fi
      echo "OK: $URL responde y carga $JS"
      exit 0
    else
      echo "No carga $JS (intento $intento)"
    fi
  else
    echo "El sitio no responde (intento $intento)"
  fi
  sleep 4
done
echo "FALLÓ la comprobación de $URL"
exit 1
