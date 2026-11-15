-- =====================================================================
-- Kaderno · schema_v22.sql  (versión 23 de la app: proyectos en grupo y ropa de temporada)
--
-- Requiere schema_v12 (proyectos), schema_v14 (bandeja de avisos) y schema_v17 (mascotas). Es
-- idempotente: se puede correr dos veces. Crece por fases (ver PLAN_v23.md).
--
-- Fase 2 · Comentarios y menciones en tareas de proyecto
--   · task_comments: comentarios de los integrantes (también los lectores)
--     con @menciones. Solo los ven los integrantes del proyecto; cada quien
--     edita o borra lo suyo (el dueño del proyecto también puede borrar).
--   · Avisos: a quien mencionan ("te mencionó") y a quien tiene la tarea
--     ("comentó en tu tarea"), con enlace que abre la tarea. El aviso de
--     "te asignaron una tarea" ya existe desde schema_v14.
--
-- Fase 4 · Ropa de temporada para las mascotas (requiere schema_v17)
--   · Siete prendas nuevas que solo se venden en su temporada (Carnaval,
--     vacaciones de mitad de año, Amor y Amistad, Halloween y Navidad), con
--     la fecha local de cada quien. Lo comprado se queda y se pone todo el año.
--   · Las fechas son las mismas de lib/pets/seasons.ts.
-- =====================================================================


-- =====================================================================
--  FASE 2 · Comentarios y menciones
-- =====================================================================
create table if not exists public.task_comments (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  task_id    uuid not null references public.project_tasks on delete cascade,
  author_id  uuid not null default auth.uid() references auth.users on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 4000),
  mentions   uuid[] not null default '{}' check (cardinality(mentions) <= 20),
  created_at timestamptz not null default now(),
  edited_at  timestamptz
);
create index if not exists task_comments_task_idx on public.task_comments (task_id, created_at);
create index if not exists task_comments_project_idx on public.task_comments (project_id);

alter table public.task_comments enable row level security;
drop policy if exists "members read comments" on public.task_comments;
create policy "members read comments" on public.task_comments for select
  using (public.is_project_member(project_id));
drop policy if exists "members write comments" on public.task_comments;
create policy "members write comments" on public.task_comments for insert
  with check (author_id = auth.uid() and public.is_project_member(project_id));
drop policy if exists "authors edit comments" on public.task_comments;
create policy "authors edit comments" on public.task_comments for update
  using (author_id = auth.uid()) with check (author_id = auth.uid() and public.is_project_member(project_id));
drop policy if exists "authors or owner delete comments" on public.task_comments;
create policy "authors or owner delete comments" on public.task_comments for delete
  using (author_id = auth.uid() or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
revoke update on public.task_comments from authenticated;
grant select, insert, delete on public.task_comments to authenticated;
grant update (body, mentions) on public.task_comments to authenticated;

-- El proyecto sale de la tarea (no se puede comentar "en otro proyecto"), las
-- menciones solo pueden ser integrantes, y editar deja la marca.
create or replace function public._task_comments_fix() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  select project_id into pid from project_tasks where id = new.task_id;
  if pid is null then raise exception 'La tarea no existe.' using errcode = 'P0001'; end if;
  new.project_id := pid;
  new.mentions := coalesce(array(
    select distinct m from unnest(new.mentions) m
     where m is distinct from new.author_id
       and exists (select 1 from project_members pm where pm.project_id = pid and pm.user_id = m)), '{}');
  if tg_op = 'INSERT' then
    if (select count(*) from task_comments where task_id = new.task_id) >= 500 then
      raise exception 'Máximo 500 comentarios por tarea.' using errcode = 'P0001';
    end if;
  else
    new.edited_at := now();
  end if;
  return new;
end $$;
drop trigger if exists task_comments_fix_trg on public.task_comments;
create trigger task_comments_fix_trg before insert or update on public.task_comments
  for each row execute function public._task_comments_fix();

-- Avisos al comentar.
create or replace function public._task_comments_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare t record; who text; pname text; excerpt text; link text; m uuid;
begin
  select pt.title, pt.assignee_id into t from project_tasks pt where pt.id = new.task_id;
  select name into pname from projects where id = new.project_id;
  select coalesce(nullif(btrim(display_name), ''), split_part(email, '@', 1), 'Alguien') into who from profiles where id = new.author_id;
  who := coalesce(who, 'Alguien');
  excerpt := left(regexp_replace(new.body, '\s+', ' ', 'g'), 90) || case when char_length(new.body) > 90 then '…' else '' end;
  link := '/proyectos/' || new.project_id::text || '?tarea=' || new.task_id::text;
  -- Menciones nuevas (al editar, solo las que no estaban).
  foreach m in array new.mentions loop
    if tg_op = 'UPDATE' and m = any(old.mentions) then continue; end if;
    insert into notification_queue (user_id, kind, ref, title, body, url)
    values (m, 'mention', new.id::text || ':' || m::text, who || ' te mencionó',
            coalesce(pname, 'Proyecto') || ' · ' || coalesce(t.title, 'Tarea') || ': ' || excerpt, link)
    on conflict (user_id, kind, ref) do nothing;
  end loop;
  -- Quien tiene la tarea (si no comentó ni fue mencionado).
  if tg_op = 'INSERT' and t.assignee_id is not null and t.assignee_id <> new.author_id and not (t.assignee_id = any(new.mentions)) then
    insert into notification_queue (user_id, kind, ref, title, body, url)
    values (t.assignee_id, 'comment', new.id::text, who || ' comentó en tu tarea',
            coalesce(pname, 'Proyecto') || ' · ' || coalesce(t.title, 'Tarea') || ': ' || excerpt, link)
    on conflict (user_id, kind, ref) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists task_comments_notify_trg on public.task_comments;
create trigger task_comments_notify_trg after insert or update of mentions on public.task_comments
  for each row execute function public._task_comments_notify();

-- El aviso de asignación (schema_v14) ahora abre la tarea directamente.
create or replace function public._kaderno_task_assigned() returns trigger
language plpgsql security definer set search_path = public as $$
declare pname text;
begin
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and new.assignee_id is distinct from auth.uid() then
    select name into pname from public.projects where id = new.project_id;
    insert into public.notification_queue (user_id, kind, ref, title, body, url)
    values (new.assignee_id, 'assigned', new.id::text || ':' || new.assignee_id::text,
            'Te asignaron una tarea', coalesce(pname, 'Proyecto') || ': ' || new.title,
            '/proyectos/' || new.project_id::text || '?tarea=' || new.id::text)
    on conflict (user_id, kind, ref) do nothing;
  end if;
  return new;
end $$;


-- =====================================================================
--  FASE 4 · Ropa de temporada
-- =====================================================================
-- Catálogo completo: el de schema_v17 más la ropa de temporada.
create or replace function public._pet_item(p_item text, out price integer, out min_level integer, out slot text)
language sql immutable as $$
  select v.p, v.l, v.s from (values
    ('gorro', 60, 1, 'cabeza'), ('corbatin', 80, 1, 'cuello'), ('collar', 100, 1, 'cuello'),
    ('gafas', 120, 1, 'ojos'), ('bufanda', 150, 2, 'cuello'), ('boina', 200, 2, 'cabeza'),
    ('audifonos', 250, 3, 'cabeza'), ('gafas_sol', 300, 4, 'ojos'), ('birrete', 500, 6, 'cabeza'),
    ('corona', 1000, 10, 'cabeza'),
    ('luces', 120, 1, 'cuello'), ('gorro_navidad', 150, 1, 'cabeza'), ('gafas_corazon', 160, 1, 'ojos'),
    ('antifaz', 180, 1, 'ojos'), ('cuernos_reno', 200, 2, 'cabeza'), ('sombrero_bruja', 200, 2, 'cabeza'),
    ('sombrero_vueltiao', 220, 2, 'cabeza'),
    ('papel_rayas', 80, 1, 'papel'), ('papel_ladrillo', 120, 1, 'papel'), ('papel_madera', 200, 2, 'papel'),
    ('papel_estrellas', 250, 3, 'papel'),
    ('piso_baldosa', 80, 1, 'piso'), ('piso_alfombrado', 120, 1, 'piso'), ('piso_marmol', 250, 3, 'piso'),
    ('vista_montanas', 150, 1, 'vista'), ('vista_playa', 200, 2, 'vista'), ('vista_espacio', 400, 5, 'vista'),
    ('lampara', 60, 1, 'mueble'), ('cojin', 60, 1, 'mueble'), ('planta', 70, 1, 'mueble'),
    ('alfombra', 90, 1, 'mueble'), ('cuadro', 100, 1, 'mueble'), ('estante', 120, 1, 'mueble')
  ) v(i, p, l, s) where v.i = p_item;
$$;

-- Temporada de una prenda: desde y hasta como mes * 100 + día (si "hasta" es
-- menor que "desde", cruza el año). Sin fila = se vende todo el año.
create or replace function public._pet_season(p_item text, out name text, out d_from integer, out d_to integer)
language sql immutable as $$
  select v.n, v.a, v.b from (values
    ('antifaz', 'Carnaval', 120, 310),
    ('sombrero_vueltiao', 'Vacaciones de mitad de año', 615, 731),
    ('gafas_corazon', 'Amor y Amistad', 901, 930),
    ('sombrero_bruja', 'Halloween', 1001, 1102),
    ('gorro_navidad', 'Navidad', 1201, 106), ('cuernos_reno', 'Navidad', 1201, 106), ('luces', 'Navidad', 1201, 106)
  ) v(i, n, a, b) where v.i = p_item;
$$;

-- ¿Se puede comprar esa prenda ese día?
create or replace function public._pet_season_ok(p_item text, p_day date) returns boolean
language sql immutable as $$
  select case
    when s.d_from is null then true
    when s.d_from <= s.d_to then (extract(month from p_day) * 100 + extract(day from p_day)) between s.d_from and s.d_to
    else (extract(month from p_day) * 100 + extract(day from p_day)) >= s.d_from
      or (extract(month from p_day) * 100 + extract(day from p_day)) <= s.d_to
  end
  from (select 1) x left join public._pet_season(p_item) s on true;
$$;

-- Comprar: igual que en schema_v17, más la temporada (con la fecha local).
create or replace function public.pet_buy(p_item text) returns public.pets
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_pet public.pets; v_it record; v_day date; v_season record;
begin
  if v_user is null then raise exception 'Inicia sesión.' using errcode = '42501'; end if;
  select * into v_it from public._pet_item(p_item);
  if v_it.price is null then raise exception 'Eso no está en la tienda.' using errcode = 'P0001'; end if;
  select * into v_pet from pets where user_id = v_user and active for update;
  if v_pet.id is null then raise exception 'Primero elige una mascota.' using errcode = 'P0001'; end if;
  if exists (select 1 from pet_items where pet_id = v_pet.id and item = p_item) then
    raise exception 'Ya la tienes.' using errcode = 'P0001';
  end if;
  v_day := (now() at time zone public._kaderno_tz(v_user))::date;
  if not public._pet_season_ok(p_item, v_day) then
    select * into v_season from public._pet_season(p_item);
    raise exception 'Solo se vende en temporada de %.', v_season.name using errcode = 'P0001';
  end if;
  if public.pet_level(v_pet.xp) < v_it.min_level then
    raise exception 'Se desbloquea en el nivel %.', v_it.min_level using errcode = 'P0001';
  end if;
  if v_pet.coins < v_it.price then
    raise exception 'Te faltan % monedas.', v_it.price - v_pet.coins using errcode = 'P0001';
  end if;
  insert into pet_items (pet_id, user_id, item) values (v_pet.id, v_user, p_item);
  insert into pet_ledger (user_id, pet_id, delta, reason, ref) values (v_user, v_pet.id, -v_it.price, 'compra', v_pet.id::text || ':' || p_item);
  if v_it.slot in ('cabeza', 'ojos', 'cuello') then
    update pets set coins = coins - v_it.price, outfit = outfit || jsonb_build_object(v_it.slot, p_item)
     where id = v_pet.id returning * into v_pet;
  elsif v_it.slot = 'mueble' then
    update pets set coins = coins - v_it.price, home = home || jsonb_build_object(p_item, true)
     where id = v_pet.id returning * into v_pet;
  else
    update pets set coins = coins - v_it.price, home = home || jsonb_build_object(v_it.slot, p_item)
     where id = v_pet.id returning * into v_pet;
  end if;
  return v_pet;
end $$;
revoke all on function public.pet_buy(text) from public, anon;
grant execute on function public.pet_buy(text) to authenticated;
