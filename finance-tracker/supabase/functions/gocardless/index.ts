// ================================================================
//  Supabase Edge Function: gocardless
//  Server-stukje voor de bankkoppeling. Houdt de GoCardless-geheimen
//  server-side (nooit in de app) en praat namens de ingelogde gebruiker
//  met de GoCardless Bank Account Data API (alleen-lezen).
//
//  Benodigde function-secrets (Supabase → Edge Functions → Secrets):
//    GC_SECRET_ID    = jouw GoCardless secret_id
//    GC_SECRET_KEY   = jouw GoCardless secret_key
//  (SUPABASE_URL en SUPABASE_ANON_KEY worden automatisch geïnjecteerd.)
//
//  Acties (POST-body { action, ... }):
//    institutions  { country }                  -> lijst banken
//    link          { institution_id, redirect } -> { link, requisition_id }
//    finalize      { requisition_id }            -> koppelt rekeningen + haalt saldo
//    refresh       { account_ids: [] }           -> ververst saldo van gekoppelde rekeningen
// ================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GC = "https://bankaccountdata.gocardless.com/api/v2";

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

async function gcToken(): Promise<string> {
  const r = await fetch(`${GC}/token/new/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      secret_id: Deno.env.get("GC_SECRET_ID"),
      secret_key: Deno.env.get("GC_SECRET_KEY"),
    }),
  });
  if (!r.ok) throw new Error("GoCardless-token mislukt: " + (await r.text()).slice(0, 200));
  return (await r.json()).access;
}

async function gcGet(path: string, token: string) {
  const r = await fetch(`${GC}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`GET ${path}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function gcPost(path: string, token: string, body: unknown) {
  const r = await fetch(`${GC}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`POST ${path}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

function pickBalance(balances: any[]): number {
  if (!balances || !balances.length) return 0;
  const order = ["interimAvailable", "closingBooked", "interimBooked", "expected", "openingBooked"];
  const b = order.map((t) => balances.find((x) => x.balanceType === t)).find(Boolean) || balances[0];
  const amt = b?.balanceAmount?.amount;
  return amt != null ? Number(amt) : 0;
}

async function accountName(accId: string, token: string): Promise<{ name: string; inst: string }> {
  try {
    const det = await gcGet(`/accounts/${accId}/details/`, token);
    const a = det.account || {};
    const iban = a.iban || "";
    const name = a.name || a.displayName || a.product || (iban ? "Rekening ••" + iban.slice(-4) : "Bankrekening");
    return { name, inst: a.name || "" };
  } catch (_) {
    return { name: "Bankrekening", inst: "" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    // Ingelogde gebruiker vaststellen (RLS geldt als deze gebruiker).
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "niet ingelogd" }, 401);

    const { action, ...p } = await req.json();
    const token = await gcToken();

    if (action === "institutions") {
      const list = await gcGet(`/institutions/?country=${(p.country || "nl").toLowerCase()}`, token);
      return json((list || []).map((i: any) => ({ id: i.id, name: i.name, logo: i.logo })));
    }

    if (action === "link") {
      if (!p.institution_id || !p.redirect) return json({ error: "institution_id en redirect vereist" }, 400);
      const requisition = await gcPost(`/requisitions/`, token, {
        institution_id: p.institution_id,
        redirect: p.redirect,
        reference: `${user.id}:${Date.now()}`,
        user_language: "NL",
      });
      return json({ link: requisition.link, requisition_id: requisition.id });
    }

    if (action === "finalize" || action === "refresh") {
      let accountIds: string[] = [];
      if (action === "finalize") {
        if (!p.requisition_id) return json({ error: "requisition_id vereist" }, 400);
        const reqData = await gcGet(`/requisitions/${p.requisition_id}/`, token);
        accountIds = reqData.accounts || [];
      } else {
        accountIds = p.account_ids || [];
      }

      const results: any[] = [];
      for (const accId of accountIds) {
        let balance = 0;
        try {
          const bal = await gcGet(`/accounts/${accId}/balances/`, token);
          balance = pickBalance(bal.balances);
        } catch (_) { /* saldo tijdelijk niet beschikbaar */ }

        const { data: existing } = await supabase
          .from("fin_accounts").select("id").eq("gc_account_id", accId).maybeSingle();

        if (existing) {
          await supabase.from("fin_accounts")
            .update({ balance, synced_at: new Date().toISOString() })
            .eq("id", existing.id);
          results.push({ account_id: accId, balance, updated: true });
        } else {
          const { name, inst } = await accountName(accId, token);
          await supabase.from("fin_accounts").insert({
            user_id: user.id, name, type: "checking", balance,
            gc_account_id: accId, gc_institution: inst, synced_at: new Date().toISOString(),
          });
          results.push({ account_id: accId, balance, name, created: true });
        }
      }
      return json({ accounts: results });
    }

    return json({ error: "onbekende actie" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
