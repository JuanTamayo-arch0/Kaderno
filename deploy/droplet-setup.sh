#!/usr/bin/env bash
# =====================================================================
# droplet-setup.sh · se corre UNA vez en el droplet, como root.
#
#   sudo bash droplet-setup.sh "ssh-ed25519 AAAA... github-actions-kaderno"
#
# Se puede volver a correr para agregar otra llave (por ejemplo la de tu
# Mac); no rompe nada de lo que ya existe.
#
# Qué hace:
#   1. Instala /usr/local/bin/kaderno-deploy (debe estar junto a este script).
#   2. Crea el usuario "deploy", que solo puede correr ese comando.
#   3. Crea /var/www/kaderno-app/{releases,shared}.
#   4. Convierte la carpeta actual /var/www/kaderno en la primera versión,
#      sin perder tu kaderno-config.js, y deja /var/www/kaderno como enlace.
#      El servidor web (Caddy o nginx) no necesita ningún cambio.
# =====================================================================
set -euo pipefail

WEB="${KADERNO_WEB:-/var/www/kaderno}"
BASE="${KADERNO_BASE:-/var/www/kaderno-app}"
USER_NAME="${KADERNO_USER:-deploy}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEY="${1:-}"

[ "$(id -u)" -eq 0 ] || { echo "Córrelo como root (sudo)"; exit 1; }
[ -f "$HERE/kaderno-deploy" ] || { echo "Falta kaderno-deploy junto a este script"; exit 1; }
if [ -n "$KEY" ] && ! [[ "$KEY" =~ ^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp[0-9]+)\ [A-Za-z0-9+/=]+(\ .*)?$ ]]; then
  echo "La llave no parece una llave pública SSH (debe empezar por ssh-ed25519 ...)"; exit 1
fi

echo "== 1. Comando de despliegue"
install -o root -g root -m 755 "$HERE/kaderno-deploy" /usr/local/bin/kaderno-deploy

echo "== 2. Usuario $USER_NAME"
if ! id "$USER_NAME" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$USER_NAME"
  passwd -l "$USER_NAME" >/dev/null   # sin contraseña: solo entra con llave
fi
HOME_DIR="$(getent passwd "$USER_NAME" | cut -d: -f6)"
install -d -o "$USER_NAME" -g "$USER_NAME" -m 700 "$HOME_DIR/.ssh"
AUTH="$HOME_DIR/.ssh/authorized_keys"
touch "$AUTH"; chown "$USER_NAME:$USER_NAME" "$AUTH"; chmod 600 "$AUTH"
if [ -n "$KEY" ]; then
  KEY_BODY="$(echo "$KEY" | awk '{print $2}')"
  if grep -qF "$KEY_BODY" "$AUTH"; then
    echo "   la llave ya estaba autorizada"
  else
    echo "restrict,command=\"/usr/local/bin/kaderno-deploy\" $KEY" >> "$AUTH"
    echo "   llave autorizada (solo puede correr kaderno-deploy)"
  fi
else
  echo "   (no se pasó llave; agrégala volviendo a correr el script con la llave)"
fi

echo "== 3. Carpetas"
install -d -o "$USER_NAME" -g "$USER_NAME" -m 755 "$BASE" "$BASE/releases"
install -d -o root -g root -m 755 "$BASE/shared"

echo "== 4. Migrar $WEB"
if [ -L "$WEB" ]; then
  echo "   $WEB ya es un enlace a $(readlink "$WEB"); nada que migrar"
else
  if [ -f "$WEB/kaderno-config.js" ] && [ ! -f "$BASE/shared/kaderno-config.js" ]; then
    # Si no es un enlace, es la config real que editaste a mano.
    cp -p "$WEB/kaderno-config.js" "$BASE/shared/kaderno-config.js"
    echo "   kaderno-config.js copiado a $BASE/shared/"
  fi
  if [ ! -f "$BASE/shared/kaderno-config.js" ]; then
    cat > "$BASE/shared/kaderno-config.js" <<'JS'
// Configuración de Supabase para el build web. Edita los valores y recarga.
window.KADERNO_CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
};
JS
    echo "   creado $BASE/shared/kaderno-config.js vacío: llénalo con tus valores"
  fi
  chown root:root "$BASE/shared/kaderno-config.js"; chmod 644 "$BASE/shared/kaderno-config.js"

  if [ -d "$WEB" ] && [ -f "$WEB/index.html" ]; then
    FIRST="$(date -u +%Y%m%d-%H%M%S)-inicial"
    cp -a "$WEB" "$BASE/releases/$FIRST"
    rm -f "$BASE/releases/$FIRST/kaderno-config.js"
    ln -s "$BASE/shared/kaderno-config.js" "$BASE/releases/$FIRST/kaderno-config.js"
    chown -R "$USER_NAME:$USER_NAME" "$BASE/releases/$FIRST"
    ln -sfn "releases/$FIRST" "$BASE/current"
    chown -h "$USER_NAME:$USER_NAME" "$BASE/current"
    BACKUP="${WEB}.antes-de-git-$(date +%Y%m%d%H%M%S)"
    mv "$WEB" "$BACKUP"
    ln -s "$BASE/current" "$WEB"
    echo "   la versión que estaba publicada quedó como $FIRST"
    echo "   copia de seguridad de la carpeta original: $BACKUP"
  elif [ -e "$WEB" ]; then
    echo "   $WEB existe pero no tiene index.html; revísalo a mano antes de seguir"; exit 1
  else
    ln -s "$BASE/current" "$WEB"
    echo "   $WEB creado como enlace (quedará activo con el primer despliegue)"
  fi
fi

echo
echo "Listo. Comprueba desde tu Mac con:"
echo "   ssh $USER_NAME@<IP-del-droplet> list"
echo "La config de Supabase se sigue editando igual que antes:"
echo "   nano $WEB/kaderno-config.js"
