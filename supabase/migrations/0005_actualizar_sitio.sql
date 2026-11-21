-- Botón «Actualizar sitio» del panel /admin.
-- Al pulsarlo, el administrador llama a request_site_rebuild(): la base avisa a Vercel (Deploy Hook) y Vercel vuelve a
-- ejecutar `python3 build.py --strict`, que lee los cursos publicados y regenera las páginas fijas (para buscadores).
-- El enlace del Deploy Hook es un secreto: vive en academy_settings (sin políticas: nadie lo lee desde el navegador)
-- y se guarda a mano desde el SQL Editor de Supabase; nunca viaja en el código del sitio.

create extension if not exists pg_net with schema extensions;

create table if not exists academy_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table academy_settings enable row level security;
revoke all on academy_settings from anon, authenticated;

create table if not exists site_builds (
  id bigserial primary key,
  requested_by text,
  requested_at timestamptz not null default now(),
  request_id bigint
);
alter table site_builds enable row level security;
revoke all on site_builds from anon, authenticated;

create or replace function request_site_rebuild()
returns jsonb language plpgsql security definer set search_path = public, extensions, net as $$
declare hook text; last_at timestamptz; rid bigint;
begin
  if not is_academy_admin() then raise exception 'Solo un administrador puede actualizar el sitio.'; end if;
  select value into hook from academy_settings where key = 'vercel_deploy_hook';
  if hook is null or hook = '' then raise exception 'Falta guardar el enlace de despliegue (Deploy Hook) de Vercel.'; end if;
  select max(requested_at) into last_at from site_builds;
  if last_at is not null and last_at > now() - interval '60 seconds' then
    raise exception 'Ya se pidió una actualización hace menos de un minuto. Espera un momento.';
  end if;
  select net.http_post(url := hook, body := '{}'::jsonb) into rid;
  insert into site_builds(requested_by, request_id) values (jwt_email(), rid);
  return jsonb_build_object('ok', true, 'requested_at', now());
end $$;

-- Última actualización pedida y la respuesta de Vercel (201 = aceptada).
create or replace function site_rebuild_status()
returns jsonb language plpgsql security definer set search_path = public, extensions, net as $$
declare b record; code int;
begin
  if not is_academy_admin() then raise exception 'Solo un administrador.'; end if;
  select * into b from site_builds order by id desc limit 1;
  if not found then
    return jsonb_build_object('configured', exists(select 1 from academy_settings where key = 'vercel_deploy_hook'));
  end if;
  select status_code into code from net._http_response where id = b.request_id;
  return jsonb_build_object('configured', true, 'requested_at', b.requested_at, 'requested_by', b.requested_by, 'status', code);
end $$;

revoke all on function request_site_rebuild(), site_rebuild_status() from public, anon;
grant execute on function request_site_rebuild(), site_rebuild_status() to authenticated, service_role;
