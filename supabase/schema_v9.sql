-- v9: personalización sincronizada entre dispositivos
create table if not exists public.user_prefs (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  settings   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_prefs enable row level security;

drop policy if exists "user_prefs own" on public.user_prefs;
create policy "user_prefs own" on public.user_prefs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
