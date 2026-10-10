#!/bin/bash
# Corre las pruebas SQL contra un Postgres local (puerto 54329, socket /var/tmp/kpg).
P=/var/tmp/kpg; PSQL="psql -h $P -p 54329 -U postgres -v ON_ERROR_STOP=1 -q -X"
psql -h $P -p 54329 -U postgres -qX -c "drop database if exists k" && psql -h $P -p 54329 -U postgres -qX -c "create database k" || exit 1
for f in tests/sql/00_supabase_stub.sql tests/sql/01_schema_v12_supuesto.sql tests/sql/02_seed.sql supabase/schema_v13.sql supabase/schema_v13.sql; do
  echo "== $f"; $PSQL -d k -f $f 2>&1 | grep -v "^$" | head -20
done
$PSQL -d k -c "grant select on public.project_batches to authenticated;"
$PSQL -d k -f tests/sql/03_pruebas.sql 2>&1 | grep -Ev "^ set_config|^-+$|^ [a-f0-9-]{36}$|^\([0-9]+ rows?\)$|^$|^ expect_error|^ undo_project_batch|^ \{|^ *$"
