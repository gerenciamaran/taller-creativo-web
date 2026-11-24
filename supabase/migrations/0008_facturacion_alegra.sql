-- Facturación electrónica con Alegra (DAVINCI COMPANY SAS).
--
-- Flujo: el carrito pide además nombre y documento del comprador → create_order() los guarda en el pedido → cuando
-- fulfill_order() aprueba el pago, la función de borde `alegra-invoice` crea el cliente y la factura en Alegra
-- (y la envía a la DIAN si alegra_stamp = 'on') y deja el resultado en el pedido (invoice_status / invoice_number).
-- Un chequeo cada 10 minutos (pg_cron) reintenta las facturas que fallaron.
--
-- Ajustes (en academy_settings, se cargan una vez desde el SQL Editor de Supabase; NUNCA en el código ni en el chat):
--   alegra_email     correo de la cuenta de Alegra que aparece en Configuración → API
--   alegra_token     token de esa misma pantalla
--   alegra_enabled   'on' para pedir los datos de factura en el carrito y facturar
--   alegra_stamp     'on' para enviar la factura a la DIAN; si no está 'on', se deja BORRADOR en Alegra (modo de prueba)
-- Opcionales (la función los descubre y los guarda sola): alegra_tax_id, alegra_item_id, alegra_template_id,
--   alegra_payment_method (por defecto CREDIT_CARD), alegra_regime (por defecto SIMPLIFIED_REGIME).

alter table orders
  add column if not exists buyer_name text,
  add column if not exists buyer_id_type text,
  add column if not exists buyer_id_number text,
  add column if not exists invoice_status text check (invoice_status in ('SENDING', 'DRAFT', 'ISSUED', 'ERROR', 'REVIEW')),
  add column if not exists invoice_id text,
  add column if not exists invoice_number text,
  add column if not exists invoice_error text,
  add column if not exists invoice_attempts int not null default 0,
  add column if not exists invoice_claimed_at timestamptz,
  add column if not exists invoice_at timestamptz;

create index if not exists orders_invoice_pending_idx on orders (paid_at)
  where status = 'APPROVED' and invoice_status is null;

create or replace function invoicing_enabled()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(tc_setting('alegra_enabled') = 'on', false)
     and coalesce(length(tc_setting('alegra_email')) > 3, false)
     and coalesce(length(tc_setting('alegra_token')) > 10, false);
$$;
revoke all on function invoicing_enabled() from public;
grant execute on function invoicing_enabled() to anon, authenticated, service_role;

-- ---------- crear pedido (ahora con los datos de la factura) ----------
drop function if exists create_order(text, text[]);
create or replace function create_order(
  p_email text, p_slugs text[], p_name text default null, p_id_type text default null, p_id_number text default null
)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_idt text := upper(btrim(coalesce(p_id_type, '')));
  v_idn text := upper(regexp_replace(btrim(coalesce(p_id_number, '')), '[\s.\-]', '', 'g'));
  keys text[]; total bigint; ref text; cents bigint; pub text; sec text; sig text;
begin
  if not checkout_enabled() then raise exception 'Los pagos en línea todavía no están activos. Pídelo por WhatsApp.'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(v_email) > 254 then raise exception 'Escribe un correo válido.'; end if;
  if invoicing_enabled() then
    if length(v_name) < 3 or length(v_name) > 120 then raise exception 'Escribe tu nombre completo (así sale en la factura).'; end if;
    if v_idt not in ('CC', 'CE', 'NIT', 'PP') then raise exception 'Elige el tipo de documento.'; end if;
    if v_idt in ('CC', 'CE', 'NIT') and v_idn !~ '^[0-9]{5,12}$' then raise exception 'Escribe tu número de documento solo con números (sin puntos ni dígito de verificación).'; end if;
    if v_idt = 'PP' and v_idn !~ '^[A-Z0-9]{5,20}$' then raise exception 'Escribe el número de tu pasaporte.'; end if;
  else
    v_name := nullif(v_name, ''); v_idt := nullif(v_idt, ''); v_idn := nullif(v_idn, '');
  end if;
  if (select count(*) from orders where email = v_email and status = 'PENDING' and created_at > now() - interval '1 hour') >= 8 then
    raise exception 'Hay muchos intentos de pago seguidos con este correo. Espera un rato o pídelo por WhatsApp.';
  end if;
  select array_agg(distinct s order by s) into keys from unnest(coalesce(p_slugs, '{}')) s;
  total := compute_price_cop(keys);
  cents := total * 100;
  ref := 'TC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 14));
  pub := tc_setting('wompi_public_key');
  sec := tc_setting('wompi_integrity_secret');
  sig := encode(digest(ref || cents::text || 'COP' || sec, 'sha256'), 'hex');
  insert into orders(reference, email, slugs, amount_cents, currency, env, buyer_name, buyer_id_type, buyer_id_number)
  values (ref, v_email, keys, cents, 'COP', case when pub like 'pub\_prod\_%' then 'production' else 'sandbox' end,
          nullif(v_name, ''), nullif(v_idt, ''), nullif(v_idn, ''));
  return jsonb_build_object('reference', ref, 'amount_in_cents', cents, 'currency', 'COP', 'public_key', pub, 'signature', sig);
end $$;
revoke all on function create_order(text, text[], text, text, text) from public;
grant execute on function create_order(text, text[], text, text, text) to anon, authenticated, service_role;

-- ---------- control de la factura (SOLO la función de borde con service_role) ----------
-- Reserva el pedido para facturarlo: evita que dos ejecuciones al mismo tiempo creen dos facturas.
-- Un pedido que quedó «SENDING» más de 15 minutos pasa a REVIEW (puede que Alegra sí la haya creado): se revisa a mano.
create or replace function claim_invoice(p_ref text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  update orders set invoice_status = 'REVIEW', invoice_error = 'Quedó en proceso y no terminó. Revisa en Alegra si la factura se creó antes de reintentar.'
   where reference = p_ref and invoice_status = 'SENDING' and invoice_claimed_at < now() - interval '15 minutes';
  update orders
     set invoice_status = 'SENDING', invoice_attempts = invoice_attempts + 1, invoice_claimed_at = now()
   where reference = p_ref and status = 'APPROVED' and env = 'production' and buyer_id_number is not null
     and (invoice_status is null or (invoice_status = 'ERROR' and invoice_attempts < 5))
  returning * into o;
  if not found then return null; end if;
  return jsonb_build_object('reference', o.reference, 'email', o.email, 'slugs', o.slugs, 'amount_cents', o.amount_cents,
    'buyer_name', o.buyer_name, 'buyer_id_type', o.buyer_id_type, 'buyer_id_number', o.buyer_id_number,
    'wompi_tx_id', o.wompi_tx_id, 'paid_at', o.paid_at, 'attempts', o.invoice_attempts);
end $$;
revoke all on function claim_invoice(text) from public, anon, authenticated;
grant execute on function claim_invoice(text) to service_role;

create or replace function finish_invoice(p_ref text, p_status text, p_id text, p_number text, p_error text)
returns void language sql security definer set search_path = public as $$
  update orders
     set invoice_status = p_status, invoice_id = coalesce(p_id, invoice_id), invoice_number = coalesce(p_number, invoice_number),
         invoice_error = left(p_error, 500), invoice_at = case when p_status in ('DRAFT', 'ISSUED') then now() else invoice_at end
   where reference = p_ref and p_status in ('DRAFT', 'ISSUED', 'ERROR', 'REVIEW');
$$;
revoke all on function finish_invoice(text, text, text, text, text) from public, anon, authenticated;
grant execute on function finish_invoice(text, text, text, text, text) to service_role;

-- Pedidos listos para facturar (los más antiguos primero).
create or replace function invoices_pending(p_limit int default 10)
returns table (reference text)
language sql stable security definer set search_path = public as $$
  select reference from orders
   where status = 'APPROVED' and env = 'production' and buyer_id_number is not null
     and (invoice_status is null or (invoice_status = 'ERROR' and invoice_attempts < 5) or (invoice_status = 'SENDING' and invoice_claimed_at < now() - interval '15 minutes'))
   order by paid_at limit greatest(p_limit, 1);
$$;
revoke all on function invoices_pending(int) from public, anon, authenticated;
grant execute on function invoices_pending(int) to service_role;

-- ---------- chequeo cada 10 minutos: factura lo que falte (solo si hay algo pendiente) ----------
select cron.schedule('tc-facturar', '*/10 * * * *', $job$
  select net.http_post(url := 'https://kpseadjekdezqwjjflfg.supabase.co/functions/v1/alegra-invoice', body := '{}'::jsonb)
  where public.invoicing_enabled() and exists (
    select 1 from public.orders where status = 'APPROVED' and env = 'production' and buyer_id_number is not null
      and (invoice_status is null or (invoice_status = 'ERROR' and invoice_attempts < 5) or (invoice_status = 'SENDING' and invoice_claimed_at < now() - interval '15 minutes')))
$job$);
