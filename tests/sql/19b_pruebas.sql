-- Pruebas de supabase/schema_v19.sql, fase 1 (Repaso nuevo). Corren sobre la base k16.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
reset role;
grant select, insert, update, delete on public.flashcards to authenticated;

do $$ declare r record; begin
  select * into r from public.flashcards where id = 'fc000000-0000-4000-8000-000000000001';
  if r.fsrs_state <> 0 or r.stability is not null then raise exception 'la nueva no quedó nueva: %', r.fsrs_state; end if;
  select * into r from public.flashcards where id = 'fc000000-0000-4000-8000-000000000002';
  if r.fsrs_state <> 2 or r.stability <> 6 or abs(r.difficulty - 7) > 0.001 then raise exception 'migración: estado %, S %, D %', r.fsrs_state, r.stability, r.difficulty; end if;
  if (r.due_at at time zone 'America/Bogota')::date <> r.due_date then raise exception 'due_at no respeta la fecha: % vs %', r.due_at, r.due_date; end if;
  raise notice 'ok 1 migración a FSRS sin perder avance (y sin repetirse al correr dos veces)';
end $$;

do $$ begin
  begin update public.flashcards set kind = 'otro' where id = 'fc000000-0000-4000-8000-000000000001'; raise exception 'aceptó un tipo raro';
  exception when check_violation then null; end;
  insert into public.flashcards (user_id, front, back) values ('a1000000-0000-4000-8000-000000000001', 'x', 'y');
  if (select fsrs_state from public.flashcards where front = 'x') <> 0 then raise exception 'una tarjeta nueva no nace nueva'; end if;
  raise notice 'ok 2 tipos válidos y tarjetas nuevas como nuevas';
end $$;

-- La versión vieja solo cambia due_date: se refleja en due_at.
do $$ declare r record; begin
  update public.flashcards set due_date = current_date + 10, interval_days = 10, reps = 1 where id = 'fc000000-0000-4000-8000-000000000001';
  select * into r from public.flashcards where id = 'fc000000-0000-4000-8000-000000000001';
  if r.fsrs_state <> 2 or (r.due_at at time zone 'America/Bogota')::date <> current_date + 10 then raise exception 'no sincronizó: % %', r.fsrs_state, r.due_at; end if;
  -- La versión nueva cambia los dos: se respeta su due_at.
  update public.flashcards set due_at = now() + interval '10 minutes', due_date = current_date, fsrs_state = 1 where id = 'fc000000-0000-4000-8000-000000000001';
  select * into r from public.flashcards where id = 'fc000000-0000-4000-8000-000000000001';
  if r.due_at > now() + interval '11 minutes' then raise exception 'pisó el due_at de la versión nueva'; end if;
  raise notice 'ok 3 la versión vieja y la nueva no se contradicen';
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', false);
do $$ declare n int; begin
  insert into public.flashcard_reviews (card_id, rating, state_before, duration_ms) values ('fc000000-0000-4000-8000-000000000002', 3, 2, 8000);
  insert into public.flashcard_reviews (card_id, rating, state_before, duration_ms) values ('fc000000-0000-4000-8000-000000000002', 4, 2, 6000);
  select count(*) into n from public.flashcard_reviews where user_id = auth.uid();
  if n <> 2 then raise exception 'repasos: %', n; end if;
  begin insert into public.flashcard_reviews (card_id, rating) values ('fc000000-0000-4000-8000-000000000002', 5); raise exception 'aceptó rating 5';
  exception when check_violation then null; end;
  raise notice 'ok 4 se guardan los repasos';
end $$;
reset role;
do $$ declare n int; begin
  select count(*) into n from public.pet_reviews where card_id = 'fc000000-0000-4000-8000-000000000002';
  if n <> 1 then raise exception 'monedas: la tarjeta contó % veces hoy', n; end if;
  raise notice 'ok 5 la mascota cuenta la tarjeta una vez por día';
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000002', false);
do $$ declare n int; begin
  begin insert into public.flashcard_reviews (card_id, rating) values ('fc000000-0000-4000-8000-000000000002', 3); raise exception 'repasó una tarjeta ajena';
  exception when insufficient_privilege then null; end;
  select count(*) into n from public.flashcard_reviews;
  if n <> 0 then raise exception 've repasos ajenos'; end if;
  raise notice 'ok 6 nadie ve ni repasa tarjetas ajenas';
end $$;

do $$ declare a int; b int; c int; begin
  a := public.ai_take('flashcards', 2); b := public.ai_take('flashcards', 2); c := public.ai_take('flashcards', 2);
  if a <> 1 or b <> 0 or c <> -1 then raise exception 'ai_take: % % %', a, b, c; end if;
  if public.ai_take('quiz', 2) <> 1 then raise exception 'el tope no es por tarea'; end if;
  begin insert into public.ai_usage (user_id, day, task, n) values (auth.uid(), current_date, 'flashcards', -100); raise exception 'pudo escribir su uso';
  exception when insufficient_privilege then null; end;
  begin perform public.ai_take('DROP TABLE', 2); raise exception 'aceptó una tarea rara'; exception when raise_exception then
    if sqlerrm not like 'Uso de IA%' then raise; end if; end;
  raise notice 'ok 7 tope diario de IA por tarea';
  raise notice 'PASARON todas las pruebas de schema_v19 (fase 1)';
end $$;
