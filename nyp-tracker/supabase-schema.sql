-- ============================================================
--  NYP Uren — databaseschema voor Supabase
--  Plak dit in Supabase → SQL Editor → New query → Run.
--
--  Zelfde Supabase-project en zelfde login als je andere
--  uren-app, maar EIGEN tabellen (nyp_*), zodat je NYP-uren
--  nooit door je DHL/Dragonfly-uren lopen.
--
--  Row Level Security zorgt dat elke gebruiker alleen zijn
--  eigen rijen kan lezen/schrijven.
-- ============================================================

-- 1) Dag-invoeren — één rij per gebruiker per datum.
create table if not exists public.nyp_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date       date not null,
  hours      numeric(6,2) not null default 0,
  start_time text not null default '',   -- "17:00"
  end_time   text not null default '',   -- "22:00"
  break_min  int  not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);
create index if not exists nyp_entries_user_date_idx on public.nyp_entries(user_id, date);

-- 2) Maanden die de gebruiker handmatig op "ontvangen" heeft gezet.
create table if not exists public.nyp_paid_months (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month_key  text not null,              -- "2026-08"
  created_at timestamptz not null default now(),
  primary key (user_id, month_key)
);

-- 3) Persoonlijke instellingen — één rij per gebruiker.
create table if not exists public.nyp_settings (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  payout_day int not null default 24,    -- uitbetaling op de 24e
  submit_day int not null default 14,    -- uren doorsturen vóór de 14e
  updated_at timestamptz not null default now()
);

-- ============================================================
--  Beveiliging (Row Level Security) — alleen je eigen rijen
-- ============================================================
alter table public.nyp_entries      enable row level security;
alter table public.nyp_paid_months  enable row level security;
alter table public.nyp_settings     enable row level security;

drop policy if exists "eigen_nyp_entries" on public.nyp_entries;
create policy "eigen_nyp_entries" on public.nyp_entries
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "eigen_nyp_paid" on public.nyp_paid_months;
create policy "eigen_nyp_paid" on public.nyp_paid_months
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "eigen_nyp_settings" on public.nyp_settings;
create policy "eigen_nyp_settings" on public.nyp_settings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
--  Klaar. Elke ingelogde gebruiker kan alleen zijn eigen
--  NYP-rijen lezen/schrijven.
-- ============================================================
