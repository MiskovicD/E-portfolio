# Uitgaven & potjes — eenmalig instellen

Je uploadt screenshots of een CSV van je bank, en de app zet elke uitgave in het
juiste potje. Twijfelt hij, dan vraagt hij het **één keer** en onthoudt daarna je keuze.

Drie dingen zijn eenmalig nodig.

---

## 1. Tabellen aanmaken (2 minuten)

Supabase → **SQL Editor** → *New query* → plak de inhoud van
`supabase-expenses-schema.sql` → **Run**.

Dit maakt `fin_categories` (potjes), `fin_tx` (transacties) en `fin_rules`
(geleerde winkel→potje-regels), allemaal met RLS: alleen jij ziet je eigen data.

Zodra dit gedraaid is, verschijnen bij de eerste keer openen automatisch elf
standaardpotjes (Boodschappen, Vaste lasten, Vervoer, …). Je kunt ze hernoemen,
verwijderen of aanvullen via **Uitgaven → Potjes → Beheren**.

---

## 2. Anthropic API-key regelen

Screenshots lezen en transacties indelen gebeurt met Claude. Dat kan niet in de
browser (de key zou dan voor iedereen zichtbaar zijn), dus het loopt via een
Edge Function.

1. Ga naar <https://console.anthropic.com> → **API keys** → maak een key aan.
2. Zet er wat tegoed op (Billing). Een import van een maand kost typisch een paar cent.

---

## 3. Edge Function deployen

**Optie A — via de Supabase CLI** (aanbevolen):

```bash
supabase functions deploy expenses --project-ref zxlythycfgpqwpquuswg
```

Draai dat vanuit de map `finance-tracker/`, dus daar waar `supabase/functions/expenses/` staat.

**Optie B — via het dashboard**: Supabase → **Edge Functions** → *Deploy a new function*
→ naam **expenses** → plak de inhoud van `supabase/functions/expenses/index.ts`.

Daarna de key als secret zetten: Supabase → **Edge Functions → Secrets** → nieuw secret:

| Naam | Waarde |
|---|---|
| `ANTHROPIC_API_KEY` | je key uit stap 2 |

`SUPABASE_URL` en `SUPABASE_ANON_KEY` staan er al — die hoef je niet toe te voegen.

---

## Gebruik

**Screenshots** — maak in je bank-app screenshots van je transactieoverzicht (of
foto's van bonnetjes) en kies ze bij *Uitgaven → Screenshots*. Maximaal 8 per keer.
De app leest datum, bedrag en winkel, en zet ze in het juiste potje.

**CSV** — download bij je bank een export van je transacties en kies die bij
*Uitgaven → CSV van je bank*. Herkend worden onder andere:

- **ABN AMRO** (TXT/CSV zonder kopregel, tab-gescheiden)
- **ING** (met de kolom *Af Bij*)
- **Rabobank** (kolommen *Datum* / *Bedrag* / *Naam tegenpartij*)
- **Amex** en andere creditcards (datum, omschrijving, bedrag — alles is dan een uitgave)

Dubbele regels worden automatisch overgeslagen: dezelfde datum + bedrag +
omschrijving komt er geen tweede keer in. Je kunt dus gerust een overlappende
periode importeren.

**Even checken** — alles waar de AI minder dan 80% zeker van is, komt bovenaan de
Uitgaven-tab te staan. Eén tik op een potje en het is opgelost én geleerd: die
winkel gaat de volgende keer vanzelf goed, zonder AI-call.

---

## Goed om te weten

- Transacties zijn een **overzicht** van waar je geld heen gaat. Ze veranderen je
  saldi, netto vermogen of prognose niet — dat blijft lopen via Rekeningen en Gepland.
- Werkt de Edge Function even niet, dan wordt alles gewoon opgeslagen onder
  “Even checken”. Je raakt nooit een import kwijt.
- Budget per potje is optioneel (0 = geen budget). Vul je er een in, dan zie je
  per maand hoeveel je nog over hebt.
