// Crea la factura de venta en Alegra (DAVINCI COMPANY SAS) de los pedidos ya pagados.
//   POST { "reference": "TC-…" }  → factura ese pedido (lo llama wompi-confirm apenas se aprueba el pago).
//   POST {}                        → factura lo que falte / reintenta lo que falló (lo llama pg_cron cada 10 minutos).
//   POST { "probe": true }         → revisa la configuración con Alegra (impuesto, numeración) sin crear nada.
// Reglas: solo pedidos APPROVED de producción con datos del comprador; cada pedido se reserva con claim_invoice()
// (una sola factura por pedido); si alegra_stamp ≠ 'on' la factura queda en BORRADOR (no va a la DIAN) para revisarla.
// Las credenciales (alegra_email / alegra_token) viven en academy_settings, nunca en el código. Se despliega sin
// verificación de JWT (igual que wompi-confirm, porque la llama pg_cron): solo actúa sobre pedidos aprobados en la
// base, cada pedido se reserva con claim_invoice() y no devuelve ningún dato del comprador ni credenciales.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const ALEGRA = "https://api.alegra.com/api/v1";
const IVA_PERCENT = 19;
const ITEM_REF = "TC-GUIA";

type Claimed = {
  reference: string; email: string; slugs: string[]; amount_cents: number; buyer_name: string;
  buyer_id_type: string; buyer_id_number: string; wompi_tx_id: string | null; paid_at: string | null; attempts: number;
};
// deno-lint-ignore no-explicit-any
type Any = any;

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

async function setting(key: string): Promise<string> {
  const { data } = await sb.from("academy_settings").select("value").eq("key", key).maybeSingle();
  return ((data?.value as string | undefined) ?? "").trim();
}
async function saveSetting(key: string, value: string) {
  await sb.from("academy_settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

class AlegraError extends Error {}

function alegraClient(email: string, token: string) {
  const auth = "Basic " + btoa(`${email}:${token}`);
  return async (method: string, path: string, body?: unknown): Promise<Any> => {
    const r = await fetch(ALEGRA + path, {
      method,
      headers: { Authorization: auth, Accept: "application/json", "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let data: Any = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
    if (!r.ok) {
      const msg = typeof data === "string" ? data : (data?.message ?? data?.error ?? JSON.stringify(data));
      throw new AlegraError(`Alegra ${method} ${path.split("?")[0]} → ${r.status}: ${String(msg).slice(0, 300)}`);
    }
    return data;
  };
}

// Dígito de verificación del NIT (algoritmo de la DIAN).
function nitDv(nit: string): string {
  const w = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const d = nit.replace(/\D/g, "").split("").reverse();
  let sum = 0;
  d.forEach((c, i) => { sum += Number(c) * w[i]; });
  const m = sum % 11;
  return String(m > 1 ? 11 - m : m);
}

function bogotaDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

const PM_FROM_WOMPI: Record<string, string> = {
  CARD: "CREDIT_CARD", PSE: "DEBIT_TRANSFER", NEQUI: "DEBIT_TRANSFER", BANCOLOMBIA_TRANSFER: "DEBIT_TRANSFER",
  BANCOLOMBIA_COLLECT: "DEBIT_TRANSFER", DAVIPLATA: "DEBIT_TRANSFER",
};

// ---------- descubrimiento de la configuración de Alegra (se guarda para no repetirlo) ----------
async function resolveTaxId(al: ReturnType<typeof alegraClient>): Promise<string> {
  const saved = await setting("alegra_tax_id");
  if (saved) return saved;
  const taxes: Any[] = await al("GET", "/taxes?limit=30");
  const iva = (Array.isArray(taxes) ? taxes : []).find((t) =>
    t.status !== "inactive" && Number(t.percentage) === IVA_PERCENT && /iva/i.test(`${t.type ?? ""} ${t.name ?? ""}`) && !/rete|ica/i.test(String(t.name ?? "")));
  if (!iva) throw new AlegraError(`No encontré el impuesto IVA ${IVA_PERCENT}% en Alegra. Revísalo en Configuración → Impuestos o guarda su id en academy_settings (alegra_tax_id).`);
  await saveSetting("alegra_tax_id", String(iva.id));
  return String(iva.id);
}

async function resolveItemId(al: ReturnType<typeof alegraClient>, taxId: string): Promise<string> {
  const saved = await setting("alegra_item_id");
  if (saved) return saved;
  const found: Any[] = await al("GET", `/items?query=${ITEM_REF}&limit=30`);
  let item = (Array.isArray(found) ? found : []).find((i) => i.reference === ITEM_REF);
  if (!item) {
    item = await al("POST", "/items", {
      name: "Guía digital Taller Creativo", reference: ITEM_REF, type: "service", price: 1000, tax: [{ id: taxId }],
      description: "Guía digital de la Academia Taller Creativo",
    });
  }
  await saveSetting("alegra_item_id", String(item.id));
  return String(item.id);
}

async function resolveTemplate(al: ReturnType<typeof alegraClient>): Promise<{ id: string; electronic: boolean } | null> {
  const saved = await setting("alegra_template_id");
  const list: Any[] = await al("GET", "/number-templates?documentType=invoice");
  const arr = Array.isArray(list) ? list.filter((n) => n.status !== "inactive") : [];
  if (saved) {
    const t = arr.find((n) => String(n.id) === saved);
    return { id: saved, electronic: !!t?.isElectronic };
  }
  const el = arr.find((n) => n.isElectronic && n.isDefault) ?? arr.find((n) => n.isElectronic);
  return el ? { id: String(el.id), electronic: true } : null;
}

// ---------- cliente (contacto) ----------
async function ensureContact(al: ReturnType<typeof alegraClient>, o: Claimed): Promise<string> {
  const num = o.buyer_id_number;
  const found: Any[] = await al("GET", `/contacts?type=client&identification=${encodeURIComponent(num)}&limit=30`);
  const hit = (Array.isArray(found) ? found : []).find((c) => {
    const n = String(c.identificationObject?.number ?? c.identification ?? "").replace(/\D/g, "");
    return n === num.replace(/\D/g, "") || String(c.identification ?? "") === num;
  });
  if (hit) return String(hit.id);

  const isNit = o.buyer_id_type === "NIT";
  const parts = o.buyer_name.trim().split(/\s+/);
  const regime = (await setting("alegra_regime")) || "SIMPLIFIED_REGIME";
  const identificationObject: Record<string, string> = { type: o.buyer_id_type, number: num };
  if (isNit) identificationObject.dv = nitDv(num);
  const body: Record<string, unknown> = {
    name: o.buyer_name.trim(),
    identificationObject,
    kindOfPerson: isNit ? "LEGAL_ENTITY" : "PERSON_ENTITY",
    regime,
    email: o.email,
    type: ["client"],
  };
  if (!isNit) {
    const half = Math.max(1, Math.ceil(parts.length / 2));
    body.nameObject = { firstName: parts.slice(0, half).join(" "), lastName: parts.slice(half).join(" ") || parts[0] };
  }
  const c = await al("POST", "/contacts", body);
  return String(c.id);
}

// ---------- reparto del total pagado entre las guías (la última absorbe el redondeo) ----------
async function buildItems(o: Claimed, itemId: string, taxId: string) {
  const { data: courses } = await sb.from("courses").select("slug,title,price_cop").in("slug", o.slugs);
  const list = (courses ?? []) as Array<{ slug: string; title: string; price_cop: number }>;
  const total = Math.round(Number(o.amount_cents) / 100);
  if (!list.length) return [{ id: itemId, name: "Guías digitales Taller Creativo", price: round2(total / (1 + IVA_PERCENT / 100)), quantity: 1, tax: [{ id: taxId }] }];
  const base = list.reduce((s, c) => s + Math.max(c.price_cop, 0), 0) || list.length;
  let left = total;
  return list.map((c, i) => {
    const w = base === list.length && list.every((x) => x.price_cop <= 0) ? 1 : Math.max(c.price_cop, 0);
    const gross = i === list.length - 1 ? left : Math.round((total * w) / base);
    left -= gross;
    return {
      id: itemId, name: `Guía digital: ${c.title}`.slice(0, 150), description: "Acceso a la guía en la Academia Taller Creativo",
      price: round2(gross / (1 + IVA_PERCENT / 100)), quantity: 1, tax: [{ id: taxId }],
    };
  });
}
const round2 = (n: number) => Math.round(n * 100) / 100;

async function wompiMethod(tx: string | null): Promise<string | null> {
  if (!tx) return null;
  try {
    const pub = await setting("wompi_public_key");
    const base = pub.startsWith("pub_prod_") ? "https://production.wompi.co/v1" : "https://sandbox.wompi.co/v1";
    const r = await fetch(`${base}/transactions/${encodeURIComponent(tx)}`);
    if (!r.ok) return null;
    const t = (await r.json())?.data?.payment_method_type as string | undefined;
    return t ? (PM_FROM_WOMPI[t] ?? null) : null;
  } catch (_) { return null; }
}

// ---------- factura de un pedido ----------
async function invoiceOrder(al: ReturnType<typeof alegraClient>, o: Claimed): Promise<{ status: string; id: string; number: string | null }> {
  const stamp = (await setting("alegra_stamp")) === "on";
  const taxId = await resolveTaxId(al);
  const itemId = await resolveItemId(al, taxId);
  const tpl = await resolveTemplate(al);
  if (stamp && !tpl?.electronic) throw new AlegraError("No hay una numeración de factura electrónica activa en Alegra (Configuración → Numeraciones).");
  const clientId = await ensureContact(al, o);

  // Si un intento anterior alcanzó a crear la factura (p. ej. quedó en borrador por un error de la DIAN), se retoma esa.
  let inv: Any = null;
  const prev: Any[] = await al("GET", `/invoices?client_id=${encodeURIComponent(clientId)}&order_field=id&order_direction=DESC&limit=30`);
  inv = (Array.isArray(prev) ? prev : []).find((i) => String(i.observations ?? "").includes(o.reference) && i.status !== "void") ?? null;

  if (!inv) {
    const pm = (await wompiMethod(o.wompi_tx_id)) ?? ((await setting("alegra_payment_method")) || "CREDIT_CARD");
    const date = bogotaDate(o.paid_at ? new Date(o.paid_at) : new Date());
    const body: Record<string, unknown> = {
      date, dueDate: date, client: clientId, items: await buildItems(o, itemId, taxId),
      status: stamp ? "open" : "draft", paymentForm: "CASH", paymentMethod: pm,
      observations: `Pedido ${o.reference} (Wompi ${o.wompi_tx_id ?? "-"})`,
    };
    if (tpl) body.numberTemplate = { id: tpl.id };
    if (stamp) body.stamp = { generateStamp: true };
    inv = await al("POST", "/invoices", body);
  } else if (stamp && inv.status === "draft") {
    await al("POST", "/invoices/stamp", { ids: [String(inv.id)] });
    inv = await al("GET", `/invoices/${inv.id}`);
  }
  const number = inv.numberTemplate?.fullNumber ?? (inv.numberTemplate?.prefix ? `${inv.numberTemplate.prefix}${inv.numberTemplate.number ?? ""}` : null);
  const issued = stamp && inv.status !== "draft";
  return { status: issued ? "ISSUED" : "DRAFT", id: String(inv.id), number };
}

async function processOne(al: ReturnType<typeof alegraClient>, reference: string): Promise<string> {
  const { data: claim, error } = await sb.rpc("claim_invoice", { p_ref: reference });
  if (error) { console.error("claim_invoice", reference, error.message); return "ERROR"; }
  if (!claim) return "SKIPPED";
  const o = claim as Claimed;
  try {
    const r = await invoiceOrder(al, o);
    await sb.rpc("finish_invoice", { p_ref: reference, p_status: r.status, p_id: r.id, p_number: r.number, p_error: null });
    return r.status;
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    console.error("factura falló", reference, msg);
    await sb.rpc("finish_invoice", { p_ref: reference, p_status: "ERROR", p_id: null, p_number: null, p_error: msg });
    return "ERROR";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const { data: on } = await sb.rpc("invoicing_enabled");
  if (on !== true) return json({ skipped: "facturación desactivada o sin credenciales" });
  const al = alegraClient(await setting("alegra_email"), await setting("alegra_token"));

  let body: { reference?: unknown; probe?: unknown } = {};
  try { body = await req.json(); } catch (_) { /* cuerpo vacío */ }

  if (body.probe === true) {
    try {
      const taxId = await resolveTaxId(al);
      const tpl = await resolveTemplate(al);
      return json({ ok: true, iva_encontrado: !!taxId, numeracion_electronica: !!tpl?.electronic, modo: (await setting("alegra_stamp")) === "on" ? "DIAN (factura real)" : "BORRADOR (prueba)" });
    } catch (e) { return json({ ok: false, error: String((e as Error).message ?? e) }); }
  }

  const reference = typeof body.reference === "string" ? body.reference.trim() : "";
  if (reference) return json({ status: await processOne(al, reference) });

  const { data: pending } = await sb.rpc("invoices_pending", { p_limit: 10 });
  const out: Record<string, string> = {};
  for (const p of (pending ?? []) as Array<{ reference: string }>) out[p.reference] = await processOne(al, p.reference);
  return json({ procesados: out });
});
