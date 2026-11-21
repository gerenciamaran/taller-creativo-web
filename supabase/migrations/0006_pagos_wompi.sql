-- Pagos en pesos con Wompi (checkout web).
--
-- Flujo: el carrito pide el correo → create_order() calcula el precio EN LA BASE (nunca el del navegador), crea un
-- pedido y devuelve los datos firmados para el checkout de Wompi → el comprador paga y vuelve a /gracias → la función
-- de borde `wompi-confirm` le pregunta a Wompi por esa referencia y, si hay una transacción APPROVED por el monto exacto,
-- llama a fulfill_order() (solo service_role), que da acceso al correo del pedido. Un chequeo cada 5 minutos (pg_cron)
-- confirma los pagos de quien cerró la página antes de volver.
-- No usa webhook: Wompi permite una sola URL de eventos por cuenta y la cuenta de DAVINCI ya la usa iJob.
--
-- Secretos (se guardan una vez desde el SQL Editor de Supabase, nunca en el código ni en el chat), en academy_settings:
--   wompi_public_key        pub_test_… o pub_prod_…   (la llave pública no es secreta, pero define el ambiente)
--   wompi_integrity_secret  test_integrity_… o prod_integrity_…
--   wompi_enabled           'on' para mostrar el pago en el carrito

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron;

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  email text not null,
  slugs text[] not null,
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'COP',
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR')),
  wompi_tx_id text,
  env text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  last_checked_at timestamptz
);
create index if not exists orders_status_created_idx on orders (status, created_at);
alter table orders enable row level security;
revoke all on orders from anon, authenticated;
grant select on orders to authenticated;
drop policy if exists orders_admin_read on orders;
create policy orders_admin_read on orders for select to authenticated using (is_academy_admin());

-- ---------- ajustes secretos ----------
create or replace function tc_setting(p_key text)
returns text language sql stable security definer set search_path = public as $$
  select value from academy_settings where key = p_key;
$$;
revoke all on function tc_setting(text) from public, anon, authenticated;
grant execute on function tc_setting(text) to service_role;

create or replace function checkout_enabled()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(tc_setting('wompi_enabled') = 'on', false)
     and coalesce(tc_setting('wompi_public_key') like 'pub\_%', false)
     and coalesce(length(tc_setting('wompi_integrity_secret')) > 10, false);
$$;
revoke all on function checkout_enabled() from public;
grant execute on function checkout_enabled() to anon, authenticated, service_role;

-- ---------- precio en pesos (misma regla que js/catalog.js: paquete exacto o descuento por cantidad) ----------
create or replace function compute_price_cop(p_slugs text[])
returns bigint language plpgsql stable security definer set search_path = public as $$
declare keys text[]; n int; base numeric; pct numeric; tier_total numeric; best numeric; b record;
begin
  select array_agg(distinct s order by s) into keys from unnest(coalesce(p_slugs, '{}')) s;
  n := coalesce(array_length(keys, 1), 0);
  if n = 0 then raise exception 'El carrito está vacío.'; end if;
  if (select count(*) from courses where slug = any(keys) and status = 'publicado') <> n then
    raise exception 'Alguna guía del carrito ya no está disponible.';
  end if;
  select sum(price_cop) into base from courses where slug = any(keys);
  if n < 2 then return round(base)::bigint; end if;
  select percent_off into pct from pricing_tiers where min_qty <= n order by min_qty desc limit 1;
  pct := coalesce(pct, 0);
  tier_total := case when pct > 0 then round(base * (1 - pct / 100) / 100) * 100 else base end;
  best := tier_total;
  for b in select price_cop, slugs from bundles where active loop
    if (select array_agg(x order by x) from unnest(b.slugs) x) = keys and b.price_cop <= best then best := b.price_cop; end if;
  end loop;
  return least(best, base)::bigint;
end $$;
revoke all on function compute_price_cop(text[]) from public;
grant execute on function compute_price_cop(text[]) to anon, authenticated, service_role;

-- ---------- crear pedido (lo llama el carrito) ----------
create or replace function create_order(p_email text, p_slugs text[])
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_email text := lower(btrim(coalesce(p_email, ''))); keys text[]; total bigint; ref text; cents bigint; pub text; sec text; sig text;
begin
  if not checkout_enabled() then raise exception 'Los pagos en línea todavía no están activos. Pídelo por WhatsApp.'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(v_email) > 254 then raise exception 'Escribe un correo válido.'; end if;
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
  insert into orders(reference, email, slugs, amount_cents, currency, env)
  values (ref, v_email, keys, cents, 'COP', case when pub like 'pub\_prod\_%' then 'production' else 'sandbox' end);
  return jsonb_build_object('reference', ref, 'amount_in_cents', cents, 'currency', 'COP', 'public_key', pub, 'signature', sig);
end $$;
revoke all on function create_order(text, text[]) from public;
grant execute on function create_order(text, text[]) to anon, authenticated, service_role;

-- ---------- estado de un pedido (la referencia es aleatoria; el correo sale enmascarado) ----------
create or replace function order_status(p_ref text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o orders; masked text;
begin
  select * into o from orders where reference = p_ref;
  if not found then return jsonb_build_object('status', 'NOT_FOUND'); end if;
  masked := regexp_replace(o.email, '^(.).*(@.*)$', '\1***\2');
  return jsonb_build_object('status', o.status, 'email', masked,
    'titles', (select coalesce(jsonb_agg(title order by title), '[]'::jsonb) from courses where slug = any(o.slugs)));
end $$;
revoke all on function order_status(text) from public;
grant execute on function order_status(text) to anon, authenticated, service_role;

-- ---------- dar acceso (SOLO la función de borde con service_role) ----------
create or replace function fulfill_order(p_ref text, p_tx text, p_amount bigint, p_currency text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  select * into o from orders where reference = p_ref for update;
  if not found then raise exception 'Pedido no encontrado.'; end if;
  if o.status = 'APPROVED' then return jsonb_build_object('status', 'APPROVED', 'already', true); end if;
  if o.amount_cents <> p_amount or o.currency <> p_currency then raise exception 'El monto del pago no coincide con el pedido.'; end if;
  update orders set status = 'APPROVED', wompi_tx_id = p_tx, paid_at = now(), last_checked_at = now() where id = o.id;
  insert into enrollments(email, course_slug, source, note)
  select o.email, s, 'wompi', 'Pedido ' || o.reference from unnest(o.slugs) s
  on conflict do nothing;
  return jsonb_build_object('status', 'APPROVED', 'already', false);
end $$;
revoke all on function fulfill_order(text, text, bigint, text) from public, anon, authenticated;
grant execute on function fulfill_order(text, text, bigint, text) to service_role;

create or replace function mark_order(p_ref text, p_status text)
returns void language sql security definer set search_path = public as $$
  update orders
     set status = case when status <> 'APPROVED' and p_status in ('PENDING', 'DECLINED', 'VOIDED', 'ERROR') then p_status else status end,
         last_checked_at = now()
   where reference = p_ref;
$$;
revoke all on function mark_order(text, text) from public, anon, authenticated;
grant execute on function mark_order(text, text) to service_role;

-- ---------- chequeo cada 5 minutos de pagos pendientes (solo si hay alguno de los últimos 3 días) ----------
select cron.schedule('tc-confirmar-pagos', '*/5 * * * *', $job$
  select net.http_post(url := 'https://kpseadjekdezqwjjflfg.supabase.co/functions/v1/wompi-confirm', body := '{}'::jsonb)
  where exists (select 1 from public.orders where status = 'PENDING' and created_at > now() - interval '3 days')
$job$);
