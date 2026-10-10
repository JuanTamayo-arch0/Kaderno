#!/usr/bin/env bash
# El package.json ya incluye TODAS las dependencias con versiones del SDK 57,
# así que normalmente basta con:  npm install
#
# Este script es un salvavidas: alinea las versiones nativas con tu SDK por si
# algo quedó desincronizado.
set -e

npm install
npm install react-native-markdown-display
npx expo install --fix

echo "✅ Dependencias instaladas y alineadas. Ahora corre: npx expo start -c"
