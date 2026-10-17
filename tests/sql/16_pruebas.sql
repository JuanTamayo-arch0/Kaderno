-- Pruebas de supabase/schema_v16.sql (mascotas). Cada bloque falla con una excepción si algo no cuadra.
-- Antes se corrió: stub, schema, v2, v9, v12, v13, v14 y v16 dos veces.
\set ON_ERROR_STOP 1
set client_min_messages = notice;

grant select, insert, update, delete on public.assignments, public.focus_sessions, public.flashcards, public.user_prefs to authenticated;

insert into auth.users (id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'a@upb.edu.co'),
  ('b2000000-0000-4000-8000-000000000002', 'b@upb.edu.co')
on conflict do nothing;
insert into public.user_prefs (user_id, settings) values
  ('a1000000-0000-4000-8000-000000000001', '{"notif": {"tz": "America/Bogota"}}')
on conflict (user_id) do update set settings = excluded.settings;

-- Fechas relativas a hoy en Bogotá. Las tareas se crean "ayer" para que paguen.
create temp table d as select (now() at time zone 'America/Bogota')::date as hoy;
grant select on d to authenticated;
insert into public.assignments (id, user_id, title, due_date, status, created_at)
select x.id::uuid, 'a1000000-0000-4000-8000-000000000001', x.t, d.hoy + x.off, 'pending', now() - interval '1 day'
  from d, (values
    ('c0000000-0000-4000-8000-000000000001', 'Antes de tener mascota', 3),
    ('c0000000-0000-4000-8000-000000000002', 'A tiempo', 0),
    ('c0000000-0000-4000-8000-000000000003', 'Tarde', -2),
    ('c0000000-0000-4000-8000-000000000004', 'Para mañana', 1)
  ) x(id, t, off);
insert into public.flashcards (id, user_id, front, back, due_date)
select gen_random_uuid(), 'a1000000-0000-4000-8000-000000000001', 'f' || g, 'b' || g, d.hoy from d, generate_series(1, 12) g;

set role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', false);

-- 1. Sin mascota no se gana nada (pero tampoco falla la tarea)
update public.assignments set status = 'done' where id = 'c0000000-0000-4000-8000-000000000001';
do $$ begin
  if (select status from public.assignments where id = 'c0000000-0000-4000-8000-000000000001') <> 'done' then raise exception 'la tarea no quedó hecha'; end if;
  if exists (select 1 from public.pet_ledger) then raise exception 'se registró una ganancia sin mascota'; end if;
  raise notice 'ok 1 sin mascota';
end $$;

-- 2. El navegador no puede escribir en las tablas de mascotas
do $$ begin
  begin
    insert into public.pets (user_id, species, name, coins, active) values ('a1000000-0000-4000-8000-000000000001', 'gato', 'Trampa', 99999, true);
    raise exception 'se pudo insertar una mascota directo';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.pet_ledger (user_id, delta, reason, ref) values ('a1000000-0000-4000-8000-000000000001', 999, 'x', 'y');
    raise exception 'se pudo insertar en el libro directo';
  exception when insufficient_privilege then null; end;
  raise notice 'ok 2 sin escritura directa';
end $$;

-- 3. Adoptar la primera es gratis; el nombre se limpia
do $$ declare p public.pets; begin
  p := public.pet_adopt('pinguino', '   Pingu    el  sabio  ');
  if p.name <> 'Pingu el sabio' or not p.active or p.coins <> 0 then raise exception 'adopción inicial mal: % % %', p.name, p.active, p.coins; end if;
  begin
    perform public.pet_adopt('gato', 'Michi');
    raise exception 'se adoptó la segunda sin monedas';
  exception when raise_exception then
    if sqlerrm not like 'Te faltan monedas%' then raise; end if;
  end;
  begin
    perform public.pet_adopt('pinguino', 'Otro');
    raise exception 'se adoptó dos veces la misma especie';
  exception when raise_exception then
    if sqlerrm <> 'Ya tienes esa mascota.' then raise; end if;
  end;
  begin
    perform public.pet_adopt('dragon', 'X');
    raise exception 'se adoptó una especie que no existe';
  exception when raise_exception then null; end;
  raise notice 'ok 3 adoptar';
end $$;

-- 4. Tarea a tiempo: 5, más 5 de racha por ser lo primero del día
update public.assignments set status = 'done' where id = 'c0000000-0000-4000-8000-000000000002';
do $$ declare p public.pets; begin
  select * into p from public.pets where active;
  if p.coins <> 10 or p.xp <> 10 then raise exception 'esperaba 10 monedas y 10 xp, hay % y %', p.coins, p.xp; end if;
  if (select delta from public.pet_ledger where reason = 'tarea' and ref = 'c0000000-0000-4000-8000-000000000002') <> 5 then raise exception 'la tarea no pagó 5'; end if;
  if (select delta from public.pet_ledger where reason = 'racha') <> 5 then raise exception 'la racha de 1 día no pagó 5'; end if;
  raise notice 'ok 4 tarea a tiempo y racha';
end $$;

-- 5. Desmarcar y volver a marcar no paga dos veces
update public.assignments set status = 'pending' where id = 'c0000000-0000-4000-8000-000000000002';
update public.assignments set status = 'done' where id = 'c0000000-0000-4000-8000-000000000002';
do $$ begin
  if (select coins from public.pets where active) <> 10 then raise exception 'marcar de nuevo volvió a pagar'; end if;
  raise notice 'ok 5 una sola vez por tarea';
end $$;

-- 6. Tarea vencida paga 2 y, al ser la última de hoy o vencida, 10 de día completo
update public.assignments set status = 'done' where id = 'c0000000-0000-4000-8000-000000000003';
do $$ begin
  if (select delta from public.pet_ledger where reason = 'tarea' and ref = 'c0000000-0000-4000-8000-000000000003') <> 2 then raise exception 'la vencida no pagó 2'; end if;
  if (select count(*) from public.pet_ledger where reason = 'dia') <> 1 then raise exception 'no pagó el día completo'; end if;
  if (select coins from public.pets where active) <> 22 then raise exception 'esperaba 22, hay %', (select coins from public.pets where active); end if;
  raise notice 'ok 6 vencida y día completo';
end $$;

-- 7. Crear y marcar enseguida no paga, ni después
insert into public.assignments (id, user_id, title, due_date) select 'c0000000-0000-4000-8000-000000000009', 'a1000000-0000-4000-8000-000000000001', 'Recién creada', hoy from d;
update public.assignments set status = 'done' where id = 'c0000000-0000-4000-8000-000000000009';
do $$ begin
  if (select delta from public.pet_ledger where reason = 'tarea' and ref = 'c0000000-0000-4000-8000-000000000009') <> 0 then raise exception 'la recién creada pagó'; end if;
  if (select coins from public.pets where active) <> 22 then raise exception 'la recién creada cambió el saldo'; end if;
  raise notice 'ok 7 recién creada';
end $$;

-- 8. Repaso: 3 por cada 10 tarjetas distintas; repetir la misma no cuenta
update public.flashcards set due_date = due_date + 3 where front in ('f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9');
update public.flashcards set due_date = due_date + 1 where front = 'f1';
update public.flashcards set back = 'editada' where front = 'f2';
do $$ begin
  if exists (select 1 from public.pet_ledger where reason = 'repaso') then raise exception 'pagó repaso antes de 10 tarjetas'; end if;
end $$;
update public.flashcards set due_date = due_date + 3 where front = 'f10';
do $$ begin
  if (select delta from public.pet_ledger where reason = 'repaso') <> 3 then raise exception 'no pagó 3 por 10 tarjetas'; end if;
  if (select reviews from public.pet_daily) <> 10 then raise exception 'conteo de repasos mal: %', (select reviews from public.pet_daily); end if;
  if (select coins from public.pets where active) <> 25 then raise exception 'esperaba 25 tras repaso'; end if;
  raise notice 'ok 8 repaso';
end $$;

-- 9. Enfoque: 1 por minuto, máximo 180 por sesión
insert into public.focus_sessions (user_id, minutes) values ('a1000000-0000-4000-8000-000000000001', 25);
do $$ begin
  if (select coins from public.pets where active) <> 50 then raise exception 'esperaba 50 tras 25 min, hay %', (select coins from public.pets where active); end if;
  raise notice 'ok 9 enfoque';
end $$;

-- 10. Comprar: nivel, saldo y que se la ponga
do $$ declare p public.pets; begin
  begin perform public.pet_buy('corona'); raise exception 'compró la corona en nivel 1';
  exception when raise_exception then if sqlerrm <> 'Se desbloquea en el nivel 10.' then raise; end if; end;
  begin perform public.pet_buy('gorro'); raise exception 'compró sin saldo';
  exception when raise_exception then if sqlerrm <> 'Te faltan 10 monedas.' then raise; end if; end;
  begin perform public.pet_buy('capa'); raise exception 'compró algo que no existe';
  exception when raise_exception then null; end;
  raise notice 'ok 10 compra bloqueada';
end $$;
insert into public.focus_sessions (user_id, minutes) values ('a1000000-0000-4000-8000-000000000001', 500);
do $$ declare p public.pets; begin
  if (select coins from public.pets where active) <> 230 then raise exception 'la sesión de 500 min no se limitó a 180: %', (select coins from public.pets where active); end if;
  p := public.pet_buy('gorro');
  if p.coins <> 170 or p.outfit ->> 'cabeza' <> 'gorro' then raise exception 'compra mal: % %', p.coins, p.outfit; end if;
  if public.pet_level(p.xp) <> 2 then raise exception 'con % xp debería ser nivel 2', p.xp; end if;
  begin perform public.pet_buy('gorro'); raise exception 'compró dos veces';
  exception when raise_exception then if sqlerrm <> 'Ya la tienes.' then raise; end if; end;
  raise notice 'ok 11 compra';
end $$;

-- 11. Vestir: solo lo comprado y en su lugar
do $$ declare p public.pets; v uuid; begin
  select id into v from public.pets where active;
  begin perform public.pet_wear(v, 'cuello', 'bufanda'); raise exception 'se puso algo sin comprar';
  exception when raise_exception then if sqlerrm <> 'Primero cómprala.' then raise; end if; end;
  begin perform public.pet_wear(v, 'cuello', 'gorro'); raise exception 'se puso el gorro en el cuello';
  exception when raise_exception then if sqlerrm <> 'Esa prenda no va ahí.' then raise; end if; end;
  p := public.pet_wear(v, 'cabeza', null);
  if p.outfit ? 'cabeza' then raise exception 'no se quitó el gorro'; end if;
  p := public.pet_wear(v, 'cabeza', 'gorro');
  if p.outfit ->> 'cabeza' <> 'gorro' then raise exception 'no se volvió a poner'; end if;
  raise notice 'ok 12 vestir';
end $$;

-- 12. Tope diario de 300 (lo que pasa del tope queda en 0 y no se recupera)
insert into public.focus_sessions (user_id, minutes) values ('a1000000-0000-4000-8000-000000000001', 180);
do $$ declare e int; begin
  select earned into e from public.pet_daily;
  if e <> 300 then raise exception 'lo ganado hoy debería quedar en 300, quedó %', e; end if;
  if (select xp from public.pets where active) <> 300 then raise exception 'la xp pasó el tope'; end if;
  raise notice 'ok 13 tope diario';
end $$;

-- 13. Adoptar la segunda con monedas suficientes (se descuenta de la activa)
reset role;
update public.pets set coins = 700 where species = 'pinguino';
set role authenticated;
do $$ declare p public.pets; begin
  p := public.pet_adopt('gato', 'Michi');
  if not p.active or p.coins <> 0 then raise exception 'el gato no quedó activo y en 0'; end if;
  if (select coins from public.pets where species = 'pinguino') <> 100 then raise exception 'no se descontaron 600 del pingüino'; end if;
  if (select count(*) from public.pets where active) <> 1 then raise exception 'quedaron dos activas'; end if;
  if (select delta from public.pet_ledger where reason = 'adopcion' and ref = 'gato') <> -600 then raise exception 'no quedó el gasto en el libro'; end if;
  p := public.pet_activate((select id from public.pets where species = 'pinguino'));
  if not p.active or (select active from public.pets where species = 'gato') then raise exception 'no cambió la activa'; end if;
  p := public.pet_rename(p.id, 'Pingüi');
  if p.name <> 'Pingüi' then raise exception 'no cambió el nombre'; end if;
  raise notice 'ok 14 adoptar, cambiar y renombrar';
end $$;

-- 14. Otro usuario no ve ni toca lo ajeno
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', false);
do $$ begin
  if exists (select 1 from public.pets) or exists (select 1 from public.pet_ledger) or exists (select 1 from public.pet_items) then
    raise exception 'B ve cosas de A';
  end if;
  begin perform public.pet_activate((select id from public.pets limit 1)); exception when raise_exception then null; end;
  raise notice 'ok 15 aislamiento';
end $$;
reset role;
do $$ declare v uuid; begin
  select id into v from public.pets where species = 'gato';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', true);
  begin perform public.pet_activate(v); raise exception 'B activó la mascota de A';
  exception when raise_exception then if sqlerrm <> 'No encontré esa mascota.' then raise; end if; end;
  begin perform public.pet_rename(v, 'Robado'); raise exception 'B renombró la mascota de A';
  exception when raise_exception then if sqlerrm <> 'No encontré esa mascota.' then raise; end if; end;
  begin perform public.pet_wear(v, 'cabeza', null); raise exception 'B vistió la mascota de A';
  exception when raise_exception then if sqlerrm <> 'No encontré esa mascota.' then raise; end if; end;
  raise notice 'ok 16 sin tocar lo ajeno';
end $$;

-- 15. Racha de varios días: 5 por día, hasta 35
reset role;
insert into public.pet_daily (user_id, day, earned)
select 'b2000000-0000-4000-8000-000000000002', hoy - g, 20 from d, generate_series(1, 9) g;
set role authenticated;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', false);
select public.pet_adopt('loro', 'Kiwi');
insert into public.focus_sessions (user_id, minutes) values ('b2000000-0000-4000-8000-000000000002', 10);
do $$ begin
  if (select delta from public.pet_ledger where reason = 'racha') <> 35 then raise exception 'la racha larga no pagó 35: %', (select delta from public.pet_ledger where reason = 'racha'); end if;
  if (select coins from public.pets where active) <> 45 then raise exception 'esperaba 45'; end if;
  raise notice 'ok 17 racha larga';
end $$;

-- 16. Niveles
reset role;
do $$ begin
  if public.pet_level(0) <> 1 or public.pet_level(99) <> 1 or public.pet_level(100) <> 2 or public.pet_level(299) <> 2
     or public.pet_level(300) <> 3 or public.pet_level(600) <> 4 or public.pet_level(1000) <> 5 or public.pet_level(1500) <> 6
     or public.pet_level(4499) <> 9 or public.pet_level(4500) <> 10 then
    raise exception 'pet_level no coincide con 50 * n * (n - 1)';
  end if;
  raise notice 'ok 18 niveles';
end $$;


-- 17. Logros: se pagan una vez, fuera del tope diario, y muestran avance
set role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', false);
do $$ declare c0 int; c1 int; e0 int; n int; r record; begin
  select coins into c0 from public.pets where active;
  select earned into e0 from public.pet_daily where day = (select hoy from d);
  select count(*) into n from public.pet_achievements() where is_new;
  if n < 3 then raise exception 'esperaba al menos 3 logros nuevos, hubo %', n; end if;
  select * into r from public.pet_achievements() where id = 'primera_tarea';
  if r.unlocked_at is null or r.is_new or r.progress <> 1 then raise exception 'primera_tarea mal: %', r; end if;
  select * into r from public.pet_achievements() where id = 'enfoque_10h';
  if r.unlocked_at is null or r.progress <> 600 then raise exception 'enfoque_10h mal: %', r; end if;
  select * into r from public.pet_achievements() where id = 'ropa_3';
  if r.unlocked_at is not null or r.progress <> 1 or r.goal <> 3 then raise exception 'ropa_3 mal: %', r; end if;
  select coins into c1 from public.pets where active;
  if c1 - c0 <> (select sum(delta) from public.pet_ledger where reason = 'logro') then raise exception 'los logros no sumaron lo que dice el libro'; end if;
  if (select earned from public.pet_daily where day = (select hoy from d)) <> e0 then raise exception 'los logros contaron para el tope diario'; end if;
  if (select count(*) from public.pet_achievements() where is_new) <> 0 then raise exception 'un logro se pagó dos veces'; end if;
  raise notice 'ok 19 logros';
end $$;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', false);
do $$ begin
  if exists (select 1 from public.pet_achievements() where id = 'primera_tarea' and unlocked_at is not null) then raise exception 'B tiene logros de A'; end if;
  raise notice 'ok 20 logros por usuario';
end $$;
reset role;

select 'TODAS LAS PRUEBAS DE V16 PASARON' as resultado;
