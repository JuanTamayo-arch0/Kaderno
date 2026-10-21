#!/bin/bash
# Pruebas de supabase/schema_v13.sql sobre el schema_v12.sql real, en un Postgres
# local (puerto 54329, socket /var/tmp/kpg).
cd "$(dirname "$0")/.."
P=/var/tmp/kpg; PSQL="psql -h $P -p 54329 -U postgres -v ON_ERROR_STOP=1 -q -X"
psql -h $P -p 54329 -U postgres -qX -c "drop database if exists k" && psql -h $P -p 54329 -U postgres -qX -c "create database k" || exit 1
for f in tests/sql/00_supabase_stub.sql supabase/schema_v12.sql tests/sql/02_seed.sql supabase/schema_v13.sql supabase/schema_v13.sql; do
  echo "== $f"; $PSQL -d k -f $f 2>&1 | grep -v "NOTICE" | grep -v "^$" | head -20
done
$PSQL -d k -c "grant select on all tables in schema public to authenticated;"
$PSQL -d k -f tests/sql/03_pruebas.sql 2>&1 | grep -Ev "^ set_config|^-+$|^ [a-f0-9-]{36}$|^\([0-9]+ rows?\)$|^$|^ expect_error|^ undo_project_batch|^ \{|^ *$"

# ---------- schema_v14 (versión 12 de la app) ----------
psql -h $P -p 54329 -U postgres -qX -c "drop database if exists k14" && psql -h $P -p 54329 -U postgres -qX -c "create database k14" || exit 1
for f in tests/sql/00_supabase_stub.sql supabase/schema.sql supabase/schema_v2.sql supabase/schema_v9.sql supabase/schema_v12.sql supabase/schema_v13.sql supabase/schema_v14.sql supabase/schema_v14.sql; do
  echo "== k14 $f"; $PSQL -d k14 -f $f 2>&1 | grep -v "NOTICE" | grep -v "^$" | head -20
done
$PSQL -d k14 -f tests/sql/14_pruebas.sql 2>&1 | grep -E "ok [0-9]+|ERROR|PASARON|exception|línea|line" | grep -v "^ *$"

# ---------- schema_v15 (versiones de archivos) ----------
psql -h $P -p 54329 -U postgres -qX -c "drop database if exists k15" && psql -h $P -p 54329 -U postgres -qX -c "create database k15" || exit 1
for f in tests/sql/00_supabase_stub.sql supabase/schema_v12.sql tests/sql/02_seed.sql tests/sql/15_antes.sql supabase/schema_v15.sql supabase/schema_v15.sql; do
  echo "== k15 $f"; $PSQL -d k15 -f $f 2>&1 | grep -v "NOTICE" | grep -v "^$" | head -20
done
$PSQL -d k15 -f tests/sql/15_pruebas.sql 2>&1 | grep -E "ok [0-9]+|ERROR|PASARON|exception|línea|line" | grep -v "^ *$"

# ---------- schema_v16 (mascotas) ----------
psql -h $P -p 54329 -U postgres -qX -c "drop database if exists k16" && psql -h $P -p 54329 -U postgres -qX -c "create database k16" || exit 1
for f in tests/sql/00_supabase_stub.sql supabase/schema.sql supabase/schema_v2.sql supabase/schema_v9.sql supabase/schema_v12.sql supabase/schema_v13.sql supabase/schema_v14.sql supabase/schema_v16.sql supabase/schema_v16.sql; do
  echo "== k16 $f"; $PSQL -d k16 -f $f 2>&1 | grep -v "NOTICE" | grep -v "^$" | head -20
done
$PSQL -d k16 -f tests/sql/16_pruebas.sql 2>&1 | grep -E "ok [0-9]+|ERROR|PASARON|exception|línea|line|WARNING" | grep -v "^ *$"

# ---------- schema_v17 (casa de la mascota), sobre la base k16 ----------
for f in supabase/schema_v17.sql supabase/schema_v17.sql; do
  echo "== k16 $f"; $PSQL -d k16 -f $f 2>&1 | grep -v "NOTICE" | grep -v "^$" | head -20
done
$PSQL -d k16 -f tests/sql/17_pruebas.sql 2>&1 | grep -E "ok [0-9]+|ERROR|PASARON|exception|línea|line|WARNING" | grep -v "^ *$"

# ---------- schema_v18 (ficha de la materia y notas), sobre la base k16 ----------
for f in supabase/schema_v18.sql supabase/schema_v18.sql; do
  echo "== k16 $f"; $PSQL -d k16 -f $f 2>&1 | grep -v "NOTICE" | grep -v "^$" | head -20
done
$PSQL -d k16 -f tests/sql/18_pruebas.sql 2>&1 | grep -E "ok [0-9]+|ERROR|PASARON|exception|línea|line|WARNING" | grep -v "^ *$"

# ---------- schema_v19 fase 5 (Enfocar juntos), sobre la base k16 ----------
for f in tests/sql/19_antes.sql supabase/schema_v19.sql supabase/schema_v19.sql; do
  echo "== k16 $f"; $PSQL -d k16 -f $f 2>&1 | grep -v "NOTICE" | grep -v "^$" | head -20
done
$PSQL -d k16 -f tests/sql/19_pruebas.sql 2>&1 | grep -E "ok [0-9]+|ERROR|PASARON|exception|línea|line|WARNING" | grep -v "^ *$"
$PSQL -d k16 -f tests/sql/19b_pruebas.sql 2>&1 | grep -E "ok [0-9]+|ERROR|PASARON|exception|línea|line|WARNING" | grep -v "^ *$"
$PSQL -d k16 -f tests/sql/19c_pruebas.sql 2>&1 | grep -E "ok [0-9]+|ERROR|PASARON|exception|línea|line|WARNING" | grep -v "^ *$"
$PSQL -d k16 -f supabase/schema_v19.sql 2>&1 | grep -E "ERROR" ; $PSQL -d k16 -f tests/sql/19c_despues.sql 2>&1 | grep -E "ok [0-9]+|ERROR|exception"
$PSQL -d k16 -f tests/sql/19d_pruebas.sql 2>&1 | grep -E "ok [0-9]+|ERROR|PASARON|exception|línea|line|WARNING" | grep -v "^ *$"
$PSQL -d k16 -f tests/sql/19e_pruebas.sql 2>&1 | grep -E "ok [0-9]+|ERROR|PASARON|exception|línea|line|WARNING" | grep -v "^ *$"

# ---------- schema_v20 (versión 21), sobre la base k16 ----------
for f in supabase/schema_v20.sql supabase/schema_v20.sql; do
  echo "== k16 $f"; $PSQL -d k16 -f $f 2>&1 | grep -v "NOTICE" | grep -v "^$" | head -20
done
$PSQL -d k16 -f tests/sql/20_pruebas.sql 2>&1 | grep -E "ok [0-9]+|ERROR|PASARON|exception|línea|line|WARNING" | grep -v "^ *$"
$PSQL -d k16 -f tests/sql/20b_pruebas.sql 2>&1 | grep -E "ok [0-9]+|ERROR|PASARON|exception|línea|line|WARNING" | grep -v "^ *$"
$PSQL -d k16 -f tests/sql/20c_pruebas.sql 2>&1 | grep -E "ok [0-9]+|ERROR|PASARON|exception|línea|line|WARNING" | grep -v "^ *$"

# ---------- schema_v21 (versión 22), sobre la base k16 ----------
for f in tests/sql/21_antes.sql supabase/schema_v21.sql supabase/schema_v21.sql; do
  echo "== k16 $f"; $PSQL -d k16 -f $f 2>&1 | grep -v "NOTICE" | grep -v "^$" | head -20
done
$PSQL -d k16 -f tests/sql/21_pruebas.sql 2>&1 | grep -E "ok [0-9]+|ERROR|PASARON|exception|línea|line|WARNING" | grep -v "^ *$"
$PSQL -d k16 -f tests/sql/21b_pruebas.sql 2>&1 | grep -E "ok [0-9]+|ERROR|PASARON|exception|línea|line|WARNING" | grep -v "^ *$"
