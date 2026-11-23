-- Precio normal (tachado) de cada curso e imagen de cada paquete.
--   · courses.list_price_cop / list_price_usd: el precio «normal»; price_cop / price_usd pasan a ser el precio de promoción
--     que se cobra por un solo curso. Si el precio normal es nulo o no es mayor que el de venta, no se muestra tachado.
--   · bundles.image_path: imagen del paquete (bucket público «covers»), editable desde /admin → Precios y paquetes.
-- Los precios y descuentos concretos son datos del negocio y se editan en /admin; aquí solo va la estructura.

alter table courses add column if not exists list_price_cop integer check (list_price_cop is null or list_price_cop >= 0);
alter table courses add column if not exists list_price_usd numeric(8, 2) check (list_price_usd is null or list_price_usd >= 0);
alter table bundles add column if not exists image_path text;

create or replace function save_course(p jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text := btrim(coalesce(p ->> 'slug', ''));
  m jsonb;
  l jsonb;
  v_mid uuid;
  v_lid uuid;
  mi integer := 0;
  li integer;
  keep_m uuid[] := '{}';
  keep_l uuid[] := '{}';
begin
  if not is_academy_admin() then
    raise exception 'Solo un administrador puede guardar cursos.';
  end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'La dirección del curso solo puede tener letras minúsculas, números y guiones (por ejemplo: dibujo-avanzado).';
  end if;

  insert into courses (slug, title, category, short, promise, who, bullets, learn, extras, kit, grad, cover_path, price_cop, price_usd, list_price_cop, list_price_usd, status, sort_order)
  values (
    v_slug, btrim(coalesce(p ->> 'title', '')), coalesce(p ->> 'category', ''), nullif(p ->> 'short', ''), nullif(p ->> 'promise', ''), nullif(p ->> 'who', ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'bullets', '[]'::jsonb))), '{}'),
    coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'learn', '[]'::jsonb))), '{}'),
    coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'extras', '[]'::jsonb))), '{}'),
    coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'kit', '[]'::jsonb))), '{}'),
    coalesce(nullif(p ->> 'grad', ''), 'g-draw'), nullif(p ->> 'cover_path', ''),
    coalesce((p ->> 'price_cop')::integer, 0), coalesce((p ->> 'price_usd')::numeric, 0),
    nullif(p ->> 'list_price_cop', '')::integer, nullif(p ->> 'list_price_usd', '')::numeric,
    coalesce(nullif(p ->> 'status', ''), 'borrador'), coalesce((p ->> 'sort_order')::integer, 100)
  )
  on conflict (slug) do update set
    title = excluded.title, category = excluded.category, short = excluded.short, promise = excluded.promise, who = excluded.who,
    bullets = excluded.bullets, learn = excluded.learn, extras = excluded.extras, kit = excluded.kit, grad = excluded.grad,
    cover_path = excluded.cover_path, price_cop = excluded.price_cop, price_usd = excluded.price_usd,
    list_price_cop = excluded.list_price_cop, list_price_usd = excluded.list_price_usd, status = excluded.status,
    sort_order = excluded.sort_order, updated_at = now();

  for m in select * from jsonb_array_elements(coalesce(p -> 'modules', '[]'::jsonb)) loop
    mi := mi + 1;
    v_mid := nullif(m ->> 'id', '')::uuid;
    if v_mid is not null and exists (select 1 from course_modules where id = v_mid and course_slug = v_slug) then
      update course_modules set title = btrim(m ->> 'title'), position = mi where id = v_mid;
    else
      insert into course_modules (course_slug, position, title) values (v_slug, mi, btrim(m ->> 'title')) returning id into v_mid;
    end if;
    keep_m := keep_m || v_mid;
    li := 0;
    for l in select * from jsonb_array_elements(coalesce(m -> 'lessons', '[]'::jsonb)) loop
      li := li + 1;
      v_lid := nullif(l ->> 'id', '')::uuid;
      if v_lid is not null and exists (select 1 from course_lessons x join course_modules y on y.id = x.module_id where x.id = v_lid and y.course_slug = v_slug) then
        update course_lessons set title = btrim(l ->> 'title'), exercise = nullif(btrim(coalesce(l ->> 'exercise', '')), ''), position = li, module_id = v_mid where id = v_lid;
      else
        insert into course_lessons (module_id, position, title, exercise) values (v_mid, li, btrim(l ->> 'title'), nullif(btrim(coalesce(l ->> 'exercise', '')), '')) returning id into v_lid;
      end if;
      keep_l := keep_l || v_lid;
    end loop;
  end loop;

  delete from course_lessons where id in (
    select x.id from course_lessons x join course_modules y on y.id = x.module_id where y.course_slug = v_slug and x.id <> all (keep_l)
  );
  delete from course_modules where course_slug = v_slug and id <> all (keep_m);
  return v_slug;
end;
$$;
