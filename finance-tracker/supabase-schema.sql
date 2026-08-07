-- ================================================================
--  Financiën-app — database-schema
--  Draai dit ÉÉN keer in Supabase → SQL Editor (New query → Run).
--  Gebruikt hetzelfde Supabase-project (en login) als je uren-apps,
--  maar met EIGEN fin_*-tabellen zodat data nooit botst.
-- ================================================================

-- ---------- Rekeningen (ABN, Amex, Knab, Trade Republic, ...) ----------
create table if not exists public.fin_accounts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  name       text not null,
  type       text not null default 'checking',   -- checking | savings | credit | investment | cash
  balance    numeric not null default 0,          -- bij 'credit' = openstaand bedrag (wat je nog moet betalen)
  sort_order int default 0,
  updated_at timestamptz default now()
);

-- ---------- Geplande posten (salaris, huur, abonnementen, incasso's) ----------
create table if not exists public.fin_planned (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  name       text not null,
  amount     numeric not null default 0,          -- altijd positief; richting volgt uit 'kind'
  kind       text not null default 'expense',     -- income | expense
  freq       text not null default 'monthly',     -- once | weekly | monthly | yearly
  anchor     date not null,                        -- eerste/ijk-datum van de reeks
  account_id uuid,                                 -- optioneel: welke rekening het raakt
  active     boolean not null default true,
  updated_at timestamptz default now()
);

-- ---------- Doelen (spaardoelen) ----------
create table if not exists public.fin_goals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  name       text not null,
  target     numeric not null default 0,
  saved      numeric not null default 0,
  updated_at timestamptz default now()
);

-- ---------- Row Level Security: iedereen ziet alleen zijn eigen data ----------
alter table public.fin_accounts enable row level security;
alter table public.fin_planned  enable row level security;
alter table public.fin_goals    enable row level security;

drop policy if exists "own fin_accounts" on public.fin_accounts;
create policy "own fin_accounts" on public.fin_accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own fin_planned" on public.fin_planned;
create policy "own fin_planned" on public.fin_planned
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own fin_goals" on public.fin_goals;
create policy "own fin_goals" on public.fin_goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
