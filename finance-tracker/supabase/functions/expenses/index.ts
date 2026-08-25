// ================================================================
//  Supabase Edge Function: expenses
//  Leest screenshots van bankafschriften/bonnetjes met Claude (vision)
//  en deelt transacties in bij het juiste potje. De API-key blijft
//  server-side; de app stuurt alleen plaatjes/regels + je potjes mee.
//
//  Benodigde function-secret (Supabase → Edge Functions → Secrets):
//    ANTHROPIC_API_KEY = jouw Anthropic API-key
//  (SUPABASE_URL en SUPABASE_ANON_KEY worden automatisch geïnjecteerd.)
//
//  Acties (POST-body { action, ... }):
//    parse { images:[{media_type,data}], today }        -> { transactions:[...] }
//    sort  { items:[...], categories:[...], examples:[] } -> { results:[...] }
// ================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk";

const MODEL = "claude-opus-5";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "" });

// Eén plek voor alle Claude-calls: JSON eruit volgens een vast schema.
async function claudeJSON(
  system: string,
  content: any[],
  schema: Record<string, unknown>,
  effort: "low" | "medium" | "high" = "low",
) {
  const base = {
    model: MODEL,
    max_tokens: 16000,
    system,
    messages: [{ role: "user" as const, content }],
    output_config: { effort, format: { type: "json_schema", schema } },
  };

  let msg: any;
  try {
    // Server-side fallback: als een veiligheidsclassifier een verzoek weigert,
    // routeert de API het automatisch naar een ander model i.p.v. te falen.
    msg = await (client as any).beta.messages.create({
      ...base,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  } catch (e) {
    const m = String((e as Error)?.message || e);
    if (!/fallback|beta|400/i.test(m)) throw e;
    msg = await (client as any).messages.create(base);
  }

  if (msg.stop_reason === "refusal") throw new Error("Verzoek geweigerd door het model");
  const text = (msg.content || [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("");
  try {
    return JSON.parse(text);
  } catch (_) {
    throw new Error("Onleesbaar antwoord van het model");
  }
}

// ---------------- Actie: screenshots lezen ----------------
const PARSE_SCHEMA = {
  type: "object",
  properties: {
    transactions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string", description: "YYYY-MM-DD" },
          description: { type: "string", description: "naam/omschrijving zoals zichtbaar" },
          amount: { type: "number", description: "bedrag, altijd positief" },
          kind: { type: "string", enum: ["expense", "income"] },
        },
        required: ["date", "description", "amount", "kind"],
        additionalProperties: false,
      },
    },
  },
  required: ["transactions"],
  additionalProperties: false,
};

const PARSE_SYSTEM = `Je leest screenshots van Nederlandse bank-apps (ABN AMRO, Knab, ING, Rabobank, Amex, Revolut, Tikkie), betaalbevestigingen en kassabonnen.

Haal ELKE zichtbare transactie eruit. Regels:
- amount is ALTIJD een positief getal in euro's. De richting zet je in kind: geld eraf = "expense", geld erbij = "income".
- Rood/min/"-"/"Betaald"/"Afgeschreven" = expense. Groen/plus/"Ontvangen"/"Bijgeschreven"/salaris/terugbetaling = income.
- date als YYYY-MM-DD. Staat er alleen "Vandaag", "Gisteren" of een dag/maand zonder jaar, reken die dan om met de meegegeven datum van vandaag.
- description: de naam van de winkel/tegenpartij zoals die op het scherm staat, plus eventueel de omschrijving. Verzin niets.
- Sla saldi, totalen, kopteksten en reeds-gereserveerde bedragen zonder eigen regel over.
- Is het één kassabon: geef één transactie met het eindtotaal, met de winkelnaam als description.
- Onleesbaar of geen transacties zichtbaar: geef een lege lijst.`;

// ---------------- Actie: indelen in potjes ----------------
const SORT_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer", description: "index uit de meegegeven lijst" },
          category: { type: "string", description: "exacte naam van een bestaand potje" },
          merchant: { type: "string", description: "opgeschoonde winkel-/partijnaam" },
          confidence: { type: "number", description: "0 t/m 1" },
          pattern: { type: "string", description: "kort herkenbaar stukje tekst in kleine letters om dit voortaan automatisch te herkennen" },
        },
        required: ["index", "category", "merchant", "confidence", "pattern"],
        additionalProperties: false,
      },
    },
  },
  required: ["results"],
  additionalProperties: false,
};

const SORT_SYSTEM = `Je deelt Nederlandse banktransacties in bij het juiste potje (categorie).

Je krijgt: de lijst met potjes, eerder geleerde voorkeuren van de gebruiker, en de transacties.

Regels:
- category MOET exact een naam uit de meegegeven potjeslijst zijn. Verzin geen nieuwe potjes.
- merchant: de opgeschoonde naam. Bankomschrijvingen zitten vol ruis ("BEA, Betaalpas ALBERT HEIJN 1234 PASNR 001 NR:XXX") — daar hoort merchant "Albert Heijn" uit te komen.
- pattern: een kort, kenmerkend stukje in KLEINE LETTERS dat in vergelijkbare omschrijvingen terugkomt ("albert heijn", "shell", "nsgroep"). Geen pasnummers, bedragen of datums. Zo herkent de app deze winkel voortaan zelf.
- confidence: 0.9+ als je het zeker weet (bekende keten of een eerder geleerde voorkeur), 0.5-0.8 bij twijfel, onder 0.5 als je het echt niet weet. Bij twijfel LAAG scoren — de gebruiker krijgt die dan één keer te zien en daarna onthoudt de app het.
- Eerder geleerde voorkeuren van de gebruiker wegen zwaarder dan je eigen aanname.
- Bekende Nederlandse ketens ken je: Albert Heijn/Jumbo/Lidl/Aldi/Dirk/Plus = boodschappen, NS/OV-chipkaart/Shell/Q8 = vervoer, Thuisbezorgd/Uber Eats = uit eten & bezorgen, Ziggo/T-Mobile/Vattenfall/Eneco = vaste lasten, Netflix/Spotify = abonnementen.
- Een transactie met kind "income" hoort in een inkomsten-potje als dat bestaat.
- Geef voor ELKE meegegeven index precies één resultaat.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (!Deno.env.get("ANTHROPIC_API_KEY")) {
      return json({ error: "ANTHROPIC_API_KEY ontbreekt in de function-secrets" }, 500);
    }

    // Ingelogde gebruiker vaststellen (deze functie schrijft niets; de app doet dat onder RLS).
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "niet ingelogd" }, 401);

    const { action, ...p } = await req.json();

    if (action === "parse") {
      const images = (p.images || []).slice(0, 8);
      if (!images.length) return json({ error: "geen afbeeldingen meegestuurd" }, 400);
      const today = String(p.today || new Date().toISOString().slice(0, 10));

      const content: any[] = images.map((im: any) => ({
        type: "image",
        source: { type: "base64", media_type: im.media_type || "image/jpeg", data: im.data },
      }));
      content.push({
        type: "text",
        text: `Vandaag is ${today}. Haal alle transacties uit deze ${images.length === 1 ? "afbeelding" : "afbeeldingen"}.`,
      });

      const out = await claudeJSON(PARSE_SYSTEM, content, PARSE_SCHEMA, "low");
      const txs = (out.transactions || [])
        .filter((t: any) => t && t.amount != null)
        .map((t: any) => ({
          date: String(t.date || today).slice(0, 10),
          description: String(t.description || "").slice(0, 200),
          amount: Math.abs(Number(t.amount) || 0),
          kind: t.kind === "income" ? "income" : "expense",
        }))
        .filter((t: any) => t.amount > 0);
      return json({ transactions: txs });
    }

    if (action === "sort") {
      const items = (p.items || []).slice(0, 200);
      const categories = p.categories || [];
      if (!items.length) return json({ results: [] });
      if (!categories.length) return json({ error: "geen potjes meegestuurd" }, 400);

      const catList = categories
        .map((c: any) => `- ${c.name}${c.kind === "income" ? " (inkomsten)" : ""}`)
        .join("\n");
      const examples = (p.examples || []).slice(0, 120)
        .map((e: any) => `- "${e.pattern}" -> ${e.category}`)
        .join("\n");
      const lines = items
        .map((t: any, i: number) =>
          `${i}. ${t.date} | ${t.kind === "income" ? "+" : "-"}${Number(t.amount).toFixed(2)} | ${String(t.description || "").slice(0, 160)}`)
        .join("\n");

      const text =
        `POTJES:\n${catList}\n\n` +
        `EERDER GELEERD:\n${examples || "(nog niets)"}\n\n` +
        `TRANSACTIES:\n${lines}`;

      const out = await claudeJSON(SORT_SYSTEM, [{ type: "text", text }], SORT_SCHEMA, "medium");

      const byName = new Map<string, any>();
      for (const c of categories) byName.set(String(c.name).toLowerCase(), c);

      const results = (out.results || []).map((r: any) => {
        const cat = byName.get(String(r.category || "").toLowerCase());
        return {
          index: Number(r.index),
          category_id: cat ? cat.id : null,
          category: cat ? cat.name : null,
          merchant: String(r.merchant || "").slice(0, 80),
          confidence: cat ? Math.max(0, Math.min(1, Number(r.confidence) || 0)) : 0,
          pattern: String(r.pattern || "").toLowerCase().slice(0, 60),
        };
      }).filter((r: any) => Number.isInteger(r.index) && r.index >= 0 && r.index < items.length);

      return json({ results });
    }

    return json({ error: "onbekende actie" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
