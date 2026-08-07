-- ================================================================
--  Bankkoppeling — uitbreiding op fin_accounts
--  Draai dit ÉÉN keer in Supabase → SQL Editor, NA het hoofd-schema.
--  Voegt de velden toe die een automatisch gekoppelde bankrekening
--  aan een GoCardless-rekening knopen.
-- ================================================================

alter table public.fin_accounts
  add column if not exists gc_account_id  text,        -- GoCardless account-id (null = handmatige rekening)
  add column if not exists gc_institution text,         -- naam/id van de bank
  add column if not exists synced_at       timestamptz; -- laatst automatisch bijgewerkt

-- Eén bankrekening kan maar aan één fin_accounts-rij hangen (per gebruiker).
create unique index if not exists fin_accounts_user_gc
  on public.fin_accounts(user_id, gc_account_id)
  where gc_account_id is not null;
