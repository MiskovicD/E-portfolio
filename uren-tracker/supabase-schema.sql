-- ============================================================
--  Uren & Verdiensten — databaseschema voor Supabase
--  Plak dit in Supabase → SQL Editor → New query → Run.
--
--  Model: ELKE GEBRUIKER ZIET ALLEEN ZIJN EIGEN GEGEVENS.
--  Row Level Security zorgt dat niemand bij andermans data kan,
--  ook al gebruikt iedereen dezelfde app en dezelfde anon key.
-- ============================================================

-- 1) Dag-invoeren — één rij per gebruiker per datum.
--    Bevat zowel DHL (stops/pakketten) als Dragonfly (uren) van die dag.
create table if not exists public.entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date       date not null,
  stops      int  not null default 0,
  packages   int  not null default 0,
  hours      numeric(6,2) not null default 0,
  start_time text not null default '',   -- "13:30"
  end_time   text not null default '',   -- "21:00"
  break_min  int  not null default 0,
  sunday     boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);
create index if not exists entries_user_date_idx on public.entries(user_id, date);

-- 2) Weken die de gebruiker handmatig op "ontvangen" heeft gezet.
create table if not exists public.paid_weeks (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_key   text not null,              -- "2026-W30"
  created_at timestamptz not null default now(),
  primary key (user_id, week_key)
);

-- 3) Persoonlijke instellingen — één rij per gebruiker.
create table if not exists public.user_settings (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  pay_delay  int not null default 5,
  updated_at timestamptz not null default now()
);

-- ============================================================
--  Beveiliging (Row Level Security) — alleen je eigen rijen
-- ============================================================
alter table public.entries       enable row level security;
alter table public.paid_weeks    enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists "eigen_entries"  on public.entries;
create policy "eigen_entries" on public.entries
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "eigen_paid" on public.paid_weeks;
create policy "eigen_paid" on public.paid_weeks
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "eigen_settings" on public.user_settings;
create policy "eigen_settings" on public.user_settings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
--  Klaar. Elke ingelogde gebruiker kan alleen zijn eigen
--  rijen lezen/schrijven. Anonieme bezoekers zien niets.
-- ============================================================
