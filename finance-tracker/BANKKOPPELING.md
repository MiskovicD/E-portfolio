# Bankkoppeling instellen (ABN AMRO, Knab, …)

Automatische koppeling loopt via **GoCardless Bank Account Data** (gratis, alleen-lezen PSD2) en een klein **Supabase Edge Function**-serverstukje dat je geheime sleutels veilig bewaart. Eenmalig instellen kost ~15 minuten.

> Trade Republic heeft geen open-banking en blijft handmatig. Amex zit soms niet in de PSD2-lijst.

---

## Stap 1 — GoCardless-account (gratis) aanmaken
1. Ga naar **https://bankaccountdata.gocardless.com/** en maak een gratis account (Bank Account Data / voorheen Nordigen).
2. Open in het dashboard **Developers → User secrets → Create new**.
3. Kopieer de **`secret_id`** en **`secret_key`**. Bewaar ze even veilig — die heb je in stap 3 nodig.

*(Ik kan deze sleutels niet voor je aanmaken of invoeren — dat doe je zelf. Ik zie ze nooit.)*

---

## Stap 2 — Database uitbreiden
Open **Supabase → SQL Editor → New query**, plak de inhoud van [`supabase-bank-schema.sql`](supabase-bank-schema.sql) en klik **Run**. (Dit voegt drie velden toe aan `fin_accounts`.)

---

## Stap 3 — Edge Function deployen
De functiecode staat in [`supabase/functions/gocardless/index.ts`](supabase/functions/gocardless/index.ts).

**Optie A — via het Supabase-dashboard (geen tools nodig):**
1. **Edge Functions → Create a new function**, naam: **`gocardless`**.
2. Plak de volledige inhoud van `index.ts` in de editor en klik **Deploy**.

**Optie B — via de Supabase CLI:**
```bash
supabase functions deploy gocardless --project-ref zxlythycfgpqwpquuswg
```

---

## Stap 4 — Geheime sleutels als secret zetten
De functie leest je GoCardless-sleutels uit function-secrets (nooit uit de app).

**Via dashboard:** **Edge Functions → Secrets → Add new secret**, voeg toe:
- `GC_SECRET_ID` = je secret_id uit stap 1
- `GC_SECRET_KEY` = je secret_key uit stap 1

**Of via CLI:**
```bash
supabase secrets set GC_SECRET_ID=... GC_SECRET_KEY=... --project-ref zxlythycfgpqwpquuswg
```

`SUPABASE_URL` en `SUPABASE_ANON_KEY` hoef je niet te zetten — die injecteert Supabase automatisch.

---

## Stap 5 — Koppelen in de app
1. Open de app → tab **Rekeningen** → **Koppel een bank (automatisch)**.
2. Kies je bank (bijv. ABN AMRO of Knab) en zoek eventueel.
3. Je wordt doorgestuurd naar je bank; log in en geef toestemming (alleen-lezen).
4. Je komt terug in de app; je saldo verschijnt vanzelf als gekoppelde rekening.
5. Later saldo bijwerken? **Ververs gekoppelde saldi**.

---

## Goed om te weten
- **Alleen-lezen:** de app kan nooit betalen of geld verplaatsen — alleen saldo/transacties lezen.
- **Herconsent elke ~90 dagen:** wettelijk verplicht; je keurt de koppeling dan opnieuw goed bij je bank.
- **Verversen:** GoCardless staat op de gratis laag een beperkt aantal ophaalacties per rekening per dag toe — meer dan genoeg voor persoonlijk gebruik.
- **Privacy:** je data loopt bank → GoCardless (gereguleerde AISP) → jouw eigen Supabase. Verder nergens heen.
