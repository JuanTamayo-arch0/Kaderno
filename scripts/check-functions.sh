#!/bin/bash
# Revisa los tipos de las funciones del servidor con Deno, sin red: copia las
# funciones a una carpeta temporal y cambia supabase-js por un reemplazo vacío.
# Uso: bash scripts/check-functions.sh   (necesita deno)
set -e
cd "$(dirname "$0")/.."
T=$(mktemp -d)
cp -r supabase/functions/. "$T"
echo "export const createClient = (..._a: any[]): any => ({});" > "$T/stub.ts"
for f in "$T"/*/index.ts; do
  sed -i "s#^import 'jsr:@supabase/functions-js/edge-runtime.d.ts';##; s#from '\(jsr\|npm\):@supabase/supabase-js@2'#from '../stub.ts'#" "$f"
done
# notify usa web-push (npm): se revisa aparte cuando hay red.
FILES=$(ls "$T"/*/index.ts | grep -v '/notify/')
deno check --no-lock $FILES
rm -rf "$T"
