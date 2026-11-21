// Confirma pagos de Wompi preguntándole a Wompi (no depende de webhooks ni de lo que diga el navegador).
//   POST { "reference": "TC-…" }  → revisa ese pedido y responde su estado (lo usa /gracias y el panel /admin).
//   POST {}                        → revisa los pedidos PENDING de los últimos 3 días (lo llama pg_cron cada 5 minutos).
// Un pago solo da acceso si Wompi devuelve una transacción APPROVED con la misma referencia, moneda y monto del pedido;
// la decisión final la toma fulfill_order() en la base (solo service_role). Se despliega sin verificación de JWT porque
// la llama el navegador de quien compra; no revela nada secreto y solo actúa con lo que confirma Wompi.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

type Order = { reference: string; amount_cents: number; currency: string; status: string; created_at: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  let body: { reference?: unknown } = {};
  try { body = await req.json(); } catch (_) { /* cuerpo vacío */ }
  const reference = typeof body.reference === "string" ? body.reference.trim() : "";

  const { data: pubRow } = await sb.from("academy_settings").select("value").eq("key", "wompi_public_key").maybeSingle();
  const pub = pubRow?.value as string | undefined;
  if (!pub) return json({ error: "Los pagos no están configurados." }, 503);
  const base = pub.startsWith("pub_prod_") ? "https://production.wompi.co/v1" : "https://sandbox.wompi.co/v1";

  async function check(o: Order): Promise<string> {
    if (o.status === "APPROVED") return "APPROVED";
    let txs: Array<{ id: string; status: string; amount_in_cents: number; currency: string; reference: string }> = [];
    try {
      const r = await fetch(`${base}/transactions?reference=${encodeURIComponent(o.reference)}`, { headers: { Authorization: `Bearer ${pub}` } });
      if (!r.ok) throw new Error("Wompi " + r.status);
      txs = ((await r.json()).data ?? []) as typeof txs;
    } catch (e) {
      console.error("consulta a Wompi falló", o.reference, String(e));
      await sb.rpc("mark_order", { p_ref: o.reference, p_status: o.status });
      return o.status;
    }
    txs = txs.filter((t) => t.reference === o.reference);
    const ok = txs.find((t) => t.status === "APPROVED" && t.amount_in_cents === Number(o.amount_cents) && t.currency === o.currency);
    if (ok) {
      const { error } = await sb.rpc("fulfill_order", { p_ref: o.reference, p_tx: ok.id, p_amount: Number(o.amount_cents), p_currency: o.currency });
      if (error) { console.error("fulfill_order", o.reference, error.message); return "PENDING"; }
      return "APPROVED";
    }
    // Sin pago aprobado: si Wompi todavía procesa alguna, sigue pendiente; si todas fallaron, se refleja el último fallo.
    const live = txs.some((t) => t.status === "PENDING");
    const last = txs.length ? txs[txs.length - 1].status : "PENDING";
    const next = live || !txs.length ? "PENDING" : (["DECLINED", "VOIDED", "ERROR"].includes(last) ? last : "PENDING");
    await sb.rpc("mark_order", { p_ref: o.reference, p_status: next });
    return next;
  }

  if (reference) {
    const { data: o } = await sb.from("orders").select("reference,amount_cents,currency,status,created_at").eq("reference", reference).maybeSingle();
    if (!o) return json({ status: "NOT_FOUND" });
    await check(o as Order);
    const { data: st } = await sb.rpc("order_status", { p_ref: reference });
    return json(st);
  }

  // Revisión general (pg_cron): pendientes recientes que no se revisaron en los últimos 2 minutos.
  const since = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
  const recheck = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: list } = await sb.from("orders").select("reference,amount_cents,currency,status,created_at")
    .eq("status", "PENDING").gt("created_at", since).or(`last_checked_at.is.null,last_checked_at.lt.${recheck}`).order("created_at").limit(25);
  let approved = 0;
  for (const o of (list ?? []) as Order[]) { if ((await check(o)) === "APPROVED") approved++; }
  return json({ revisados: (list ?? []).length, aprobados: approved });
});
