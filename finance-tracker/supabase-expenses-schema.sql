-- ================================================================
--  Financiën-app — UITGAVEN & POTJES (schema)
--  Draai dit ÉÉN keer in Supabase → SQL Editor (New query → Run).
--  Zelfde project/login als de rest van de app; eigen fin_*-tabellen.
-- ================================================================

-- ---------- Potjes (categorieën) ----------
create table if not exists public.fin_categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  name       text not null,
  budget     numeric not null default 0,        -- maandbudget; 0 = geen budget
  kind       text not null default 'expense',   -- expense | income
  sort_order int  not null default 0,
  updated_at timestamptz default now()
);

-- ---------- Transacties (geïmporteerde uitgaven/inkomsten) ----------
create table if not exists public.fin_tx (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  date         date not null,
  description  text not null default '',        -- ruwe omschrijving uit bank/screenshot
  merchant     text not null default '',        -- opgeschoonde naam (Albert Heijn, Shell, ...)
  amount       numeric not null default 0,      -- altijd positief; richting volgt uit 'kind'
  kind         text not null default 'expense', -- expense | income
  category_id  uuid references public.fin_categories on delete set null,
  account_id   uuid references public.fin_accounts   on delete set null,
  source       text not null default 'manual',  -- screenshot | csv | manual
  confidence   numeric not null default 1,      -- 0..1, hoe zeker de indeling is
  needs_review boolean not null default false,  -- true = AI wist het niet zeker
  hash         text not null default '',        -- dubbele import voorkomen
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index if not exists fin_tx_user_date_idx on public.fin_tx (user_id, date desc);
create unique index if not exists fin_tx_user_hash_idx on public.fin_tx (user_id, hash) where hash <> '';

-- ---------- Geleerde regels (winkel -> potje) ----------
create table if not exists public.fin_rules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  pattern     text not null,                    -- kleine letters; komt de omschrijving hierin voor -> match
  category_id uuid not null references public.fin_categories on delete cascade,
  kind        text not null default 'expense',
  hits        int  not null default 1,
  updated_at  timestamptz default now()
);

create unique index if not exists fin_rules_user_pattern_idx on public.fin_rules (user_id, pattern);

-- ---------- Row Level Security ----------
alter table public.fin_categories enable row level security;
alter table public.fin_tx         enable row level security;
alter table public.fin_rules      enable row level security;

drop policy if exists "own fin_categories" on public.fin_categories;
create policy "own fin_categories" on public.fin_categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own fin_tx" on public.fin_tx;
create policy "own fin_tx" on public.fin_tx
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own fin_rules" on public.fin_rules;
create policy "own fin_rules" on public.fin_rules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
