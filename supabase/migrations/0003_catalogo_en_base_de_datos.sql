-- ── Catálogo de cursos en la base de datos ────────────────────────────────
-- Hasta ahora las 4 guías estaban escritas dentro del código del sitio. Desde esta migración los cursos viven en la
-- base de datos y un administrador los crea, edita, publica y oculta desde /admin:
--   · courses / course_modules / course_lessons → el curso, sus módulos y sus lecciones (con ejercicio).
--   · lesson_videos → el video de cada lección (solo lo ve quien tiene el curso).
--   · lesson_progress → lecciones hechas por cada alumno (ahora por lección, no por número).
--   · pricing_tiers / bundles → descuentos por cantidad y paquetes con precio fijo, editables.
--   · bucket «covers» (público) para las portadas; los PDF siguen en «guides» como <curso>.pdf.
-- Las tablas de acceso (enrollments) y de progreso/videos aún no tenían datos reales, por eso se rehacen sin migrar filas.

drop table if exists lesson_progress;
drop table if exists lesson_videos;
alter table enrollments drop constraint if exists enrollments_course_slug_check;

create table courses (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  category text not null default '' check (char_length(category) <= 40),
  short text check (short is null or char_length(short) <= 400),
  promise text check (promise is null or char_length(promise) <= 800),
  who text check (who is null or char_length(who) <= 500),
  bullets text[] not null default '{}',
  learn text[] not null default '{}',
  extras text[] not null default '{}',
  kit text[] not null default '{}',
  grad text not null default 'g-draw' check (grad in ('g-draw', 'g-paint', 'g-soap', 'g-candle')),
  cover_path text check (cover_path is null or char_length(cover_path) <= 200),
  price_cop integer not null default 0 check (price_cop >= 0),
  price_usd numeric(8,2) not null default 0 check (price_usd >= 0),
  status text not null default 'borrador' check (status in ('borrador', 'publicado')),
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table course_modules (
  id uuid primary key default gen_random_uuid(),
  course_slug text not null references courses(slug) on update cascade on delete cascade,
  position integer not null default 0,
  title text not null check (char_length(btrim(title)) between 1 and 200)
);
create index course_modules_course_idx on course_modules (course_slug, position);

create table course_lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references course_modules(id) on delete cascade,
  position integer not null default 0,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  exercise text check (exercise is null or char_length(exercise) <= 1000)
);
create index course_lessons_module_idx on course_lessons (module_id, position);

create table pricing_tiers (
  min_qty integer primary key check (min_qty >= 2),
  percent_off numeric(5,2) not null check (percent_off >= 0 and percent_off <= 90)
);

create table bundles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text check (description is null or char_length(description) <= 300),
  slugs text[] not null check (cardinality(slugs) >= 2),
  price_cop integer not null check (price_cop >= 0),
  price_usd numeric(8,2) not null check (price_usd >= 0),
  featured boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 100
);

alter table courses enable row level security;
alter table course_modules enable row level security;
alter table course_lessons enable row level security;
alter table pricing_tiers enable row level security;
alter table bundles enable row level security;

-- Lectura pública de lo publicado; quien tiene el curso (o un administrador) lo ve aunque se oculte.
create policy "courses_public_read" on courses for select to anon, authenticated using (status = 'publicado');
create policy "courses_owner_read" on courses for select to authenticated using (has_course(slug) or is_academy_admin());
create policy "modules_read" on course_modules for select to anon, authenticated
  using (exists (select 1 from courses c where c.slug = course_slug));
create policy "lessons_read" on course_lessons for select to anon, authenticated
  using (exists (select 1 from course_modules m where m.id = module_id));
create policy "tiers_read" on pricing_tiers for select to anon, authenticated using (true);
create policy "tiers_write" on pricing_tiers for all to authenticated using (is_academy_admin()) with check (is_academy_admin());
create policy "bundles_public_read" on bundles for select to anon, authenticated using (active);
create policy "bundles_admin_all" on bundles for all to authenticated using (is_academy_admin()) with check (is_academy_admin());

grant select on courses, course_modules, course_lessons, pricing_tiers, bundles to anon, authenticated;
grant insert, update, delete on pricing_tiers, bundles to authenticated;
grant all on courses, course_modules, course_lessons, pricing_tiers, bundles to service_role;

-- Acceso por correo: ahora cada curso debe existir.
alter table enrollments add constraint enrollments_course_slug_fkey
  foreign key (course_slug) references courses(slug) on update cascade on delete cascade;

-- Curso de una lección (para las reglas de progreso y de video).
create or replace function lesson_course(p_lesson uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.course_slug from course_lessons l join course_modules m on m.id = l.module_id where l.id = p_lesson;
$$;
revoke all on function lesson_course(uuid) from public, anon;
grant execute on function lesson_course(uuid) to authenticated, service_role;

create table lesson_progress (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lesson_id uuid not null references course_lessons(id) on delete cascade,
  done_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
alter table lesson_progress enable row level security;
create policy "lesson_progress_select" on lesson_progress for select to authenticated using (user_id = auth.uid());
create policy "lesson_progress_insert" on lesson_progress for insert to authenticated
  with check (user_id = auth.uid() and has_course(lesson_course(lesson_id)));
create policy "lesson_progress_delete" on lesson_progress for delete to authenticated using (user_id = auth.uid());
grant select, insert, delete on lesson_progress to authenticated;
grant all on lesson_progress to service_role;
revoke all on lesson_progress from anon;

create table lesson_videos (
  lesson_id uuid primary key references course_lessons(id) on delete cascade,
  video_path text not null,
  file_name text,
  size_bytes bigint,
  uploaded_by text default jwt_email(),
  created_at timestamptz not null default now()
);
alter table lesson_videos enable row level security;
create policy "lesson_videos_select" on lesson_videos for select to authenticated
  using (has_course(lesson_course(lesson_id)) or is_academy_admin());
create policy "lesson_videos_insert" on lesson_videos for insert to authenticated
  with check (is_academy_admin() and split_part(video_path, '/', 1) = lesson_course(lesson_id));
create policy "lesson_videos_update" on lesson_videos for update to authenticated
  using (is_academy_admin()) with check (is_academy_admin() and split_part(video_path, '/', 1) = lesson_course(lesson_id));
create policy "lesson_videos_delete" on lesson_videos for delete to authenticated using (is_academy_admin());
grant select, insert, update, delete on lesson_videos to authenticated;
grant all on lesson_videos to service_role;
revoke all on lesson_videos from anon;

-- Guardar un curso completo (datos + módulos + lecciones) de una sola vez. Solo un administrador.
-- Los módulos y lecciones que traen id se actualizan; los nuevos se crean; los que ya no vienen se borran
-- (con su avance y su video). El orden es el de la lista.
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

  insert into courses (slug, title, category, short, promise, who, bullets, learn, extras, kit, grad, cover_path, price_cop, price_usd, status, sort_order)
  values (
    v_slug, btrim(coalesce(p ->> 'title', '')), coalesce(p ->> 'category', ''), nullif(p ->> 'short', ''), nullif(p ->> 'promise', ''), nullif(p ->> 'who', ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'bullets', '[]'::jsonb))), '{}'),
    coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'learn', '[]'::jsonb))), '{}'),
    coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'extras', '[]'::jsonb))), '{}'),
    coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'kit', '[]'::jsonb))), '{}'),
    coalesce(nullif(p ->> 'grad', ''), 'g-draw'), nullif(p ->> 'cover_path', ''),
    coalesce((p ->> 'price_cop')::integer, 0), coalesce((p ->> 'price_usd')::numeric, 0),
    coalesce(nullif(p ->> 'status', ''), 'borrador'), coalesce((p ->> 'sort_order')::integer, 100)
  )
  on conflict (slug) do update set
    title = excluded.title, category = excluded.category, short = excluded.short, promise = excluded.promise, who = excluded.who,
    bullets = excluded.bullets, learn = excluded.learn, extras = excluded.extras, kit = excluded.kit, grad = excluded.grad,
    cover_path = excluded.cover_path, price_cop = excluded.price_cop, price_usd = excluded.price_usd, status = excluded.status,
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

-- Borrar un curso (solo un administrador y solo si nadie lo ha comprado todavía).
create or replace function delete_course(p_slug text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_academy_admin() then
    raise exception 'Solo un administrador puede borrar cursos.';
  end if;
  if exists (select 1 from enrollments where course_slug = p_slug) then
    raise exception 'Este curso ya tiene alumnos con acceso: ocúltalo en lugar de borrarlo.';
  end if;
  delete from bundles where p_slug = any (slugs);
  delete from courses where slug = p_slug;
end;
$$;

-- Publicar u ocultar un curso (solo un administrador).
create or replace function set_course_status(p_slug text, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_academy_admin() then
    raise exception 'Solo un administrador puede publicar u ocultar cursos.';
  end if;
  if p_status not in ('borrador', 'publicado') then
    raise exception 'Estado no válido.';
  end if;
  update courses set status = p_status, updated_at = now() where slug = p_slug;
  if not found then raise exception 'El curso no existe.'; end if;
end;
$$;

revoke all on function save_course(jsonb), delete_course(text), set_course_status(text, text) from public, anon;
grant execute on function save_course(jsonb), delete_course(text), set_course_status(text, text) to authenticated, service_role;

-- La acción de dar acceso ahora valida contra los cursos que existen.
create or replace function grant_access(p_email text, p_slugs text[], p_source text default 'manual', p_note text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_slug text;
  v_new integer := 0;
  v_added integer;
begin
  if not is_academy_admin() then
    raise exception 'Solo un administrador puede dar acceso.';
  end if;
  if v_email not like '%_@_%._%' then
    raise exception 'Escribe un correo válido.';
  end if;
  if p_slugs is null or cardinality(p_slugs) = 0 then
    raise exception 'Elige al menos una guía.';
  end if;
  foreach v_slug in array p_slugs loop
    if not exists (select 1 from courses where slug = v_slug) then
      raise exception 'El curso «%» no existe.', v_slug;
    end if;
    insert into enrollments (email, course_slug, source, note, created_by)
    values (v_email, v_slug, coalesce(p_source, 'manual'), nullif(btrim(coalesce(p_note, '')), ''), jwt_email())
    on conflict (email, course_slug) do nothing;
    get diagnostics v_added = row_count;
    v_new := v_new + v_added;
  end loop;
  return v_new;
end;
$$;

-- Almacenamiento: portadas (público) y permisos de escritura del administrador en los PDF.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('covers', 'covers', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "covers_admin_insert" on storage.objects for insert to authenticated with check (bucket_id = 'covers' and is_academy_admin());
create policy "covers_admin_update" on storage.objects for update to authenticated using (bucket_id = 'covers' and is_academy_admin()) with check (bucket_id = 'covers' and is_academy_admin());
create policy "covers_admin_delete" on storage.objects for delete to authenticated using (bucket_id = 'covers' and is_academy_admin());
create policy "guides_admin_insert" on storage.objects for insert to authenticated with check (bucket_id = 'guides' and is_academy_admin());
create policy "guides_admin_update" on storage.objects for update to authenticated using (bucket_id = 'guides' and is_academy_admin()) with check (bucket_id = 'guides' and is_academy_admin());
create policy "guides_admin_delete" on storage.objects for delete to authenticated using (bucket_id = 'guides' and is_academy_admin());
-- El administrador también abre los PDF (vista previa).
drop policy if exists "guides_read_if_enrolled" on storage.objects;
create policy "guides_read_if_enrolled" on storage.objects for select to authenticated
  using (bucket_id = 'guides' and (has_course(split_part(name, '.', 1)) or is_academy_admin()));

-- ── Datos: las 4 guías actuales, sus precios, descuentos y paquetes ──
insert into courses (slug, title, category, short, promise, who, bullets, learn, extras, kit, grad, cover_path, price_cop, price_usd, status, sort_order) values ($q$dibujo$q$, $q$Dibujo Desde Cero$q$, $q$Dibujo$q$, $q$De las formas básicas y la proporción a tu primer dibujo terminado, con rostro incluido.$q$, $q$Aprende a dibujar desde cero, incluso si nunca has tomado una clase de arte, con ejercicios cortos que puedes practicar hoy mismo.$q$, $q$Para quien piensa «no sé dibujar» y quiere un camino claro, paso a paso, sin necesitar talento previo.$q$, array[$q$Formas, proporción, luz y sombra$q$, $q$Texturas, rostros y composición$q$, $q$30 ejercicios y plantillas para calcar$q$]::text[], array[$q$Controlar la presión y la línea del lápiz$q$, $q$Reducir cualquier objeto a formas básicas$q$, $q$Medir proporciones a ojo y usar ejes de simetría$q$, $q$Dar volumen con luz, sombra y degradados$q$, $q$Dibujar texturas: madera, metal, vidrio, tela, piel y cabello$q$, $q$Construir un rostro con ojos, nariz, boca y cabello$q$, $q$Planear un boceto y terminar tu primer dibujo$q$]::text[], array[$q$30 ejercicios de dibujo adicionales, organizados por módulo$q$, $q$Plantillas de práctica para calcar: formas básicas, proporción de rostro y escala de tonos$q$, $q$Guía de materiales según tu presupuesto$q$, $q$Banco de referencias para practicar$q$, $q$Certificado digital de finalización$q$]::text[], array[$q$Lápices HB, 2B y 6B$q$, $q$Un borrador$q$, $q$Un cuaderno o block de dibujo$q$]::text[], $q$g-draw$q$, $q$dibujo.jpg$q$, 24000, 6, 'publicado', 10);
insert into course_modules (course_slug, position, title) values ($q$dibujo$q$, 1, $q$Bienvenida y materiales$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$dibujo$q$ and position = 1), 1, $q$1.1 Bienvenida a Dibujo Desde Cero$q$, $q$Escribe qué te gustaría poder dibujar en 8 semanas.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$dibujo$q$ and position = 1), 2, $q$1.2 Materiales: qué comprar y qué no necesitas todavía$q$, $q$Arma tu kit básico y tómale una foto.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$dibujo$q$ and position = 1), 3, $q$1.3 Presión y control de línea$q$, $q$Llena una hoja con 5 tipos de línea distintos.$q$);
insert into course_modules (course_slug, position, title) values ($q$dibujo$q$, 2, $q$Formas básicas$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$dibujo$q$ and position = 2), 1, $q$2.1 El círculo y la elipse$q$, $q$Dibuja 10 círculos a mano alzada, sin plantilla.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$dibujo$q$ and position = 2), 2, $q$2.2 Cuadrados, cilindros y esferas$q$, $q$Dibuja un cilindro y una esfera con su sombra básica.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$dibujo$q$ and position = 2), 3, $q$2.3 De formas a objetos$q$, $q$Elige 3 objetos de tu casa y redúcelos a formas básicas antes de dibujarlos.$q$);
insert into course_modules (course_slug, position, title) values ($q$dibujo$q$, 3, $q$Proporción$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$dibujo$q$ and position = 3), 1, $q$3.1 Medición a ojo con el lápiz$q$, $q$Mide con el lápiz la altura y el ancho de una taza antes de dibujarla.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$dibujo$q$ and position = 3), 2, $q$3.2 Simetría y ejes$q$, $q$Dibuja un florero usando una línea guía central.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$dibujo$q$ and position = 3), 3, $q$3.3 Errores frecuentes de proporción$q$, $q$Revisa un dibujo tuyo anterior y marca 3 errores que ahora puedas corregir.$q$);
insert into course_modules (course_slug, position, title) values ($q$dibujo$q$, 4, $q$Luz y sombra$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$dibujo$q$ and position = 4), 1, $q$4.1 De dónde viene la luz$q$, $q$Observa una fruta junto a una ventana 5 minutos y anota cómo cambia su sombra.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$dibujo$q$ and position = 4), 2, $q$4.2 Sombra propia y sombra proyectada$q$, $q$Dibuja un cubo marcando sus dos tipos de sombra.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$dibujo$q$ and position = 4), 3, $q$4.3 Dar volumen con degradados$q$, $q$Dibuja una esfera con tres tonos de sombra.$q$);
insert into course_modules (course_slug, position, title) values ($q$dibujo$q$, 5, $q$Texturas$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$dibujo$q$ and position = 5), 1, $q$5.1 Madera y metal$q$, $q$Dibuja un cuadro de 5×5 cm de cada textura.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$dibujo$q$ and position = 5), 2, $q$5.2 Vidrio y tela$q$, $q$Dibuja un vaso de vidrio y un trozo de tela con pliegues.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$dibujo$q$ and position = 5), 3, $q$5.3 Piel y cabello$q$, $q$Dibuja una textura de piel de animal y un mechón de cabello.$q$);
insert into course_modules (course_slug, position, title) values ($q$dibujo$q$, 6, $q$Rostros$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$dibujo$q$ and position = 6), 1, $q$6.1 La estructura de la cabeza$q$, $q$Dibuja un óvalo y traza las líneas guía de ojos, nariz y boca.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$dibujo$q$ and position = 6), 2, $q$6.2 Ojos y nariz$q$, $q$Dibuja 5 pares de ojos con expresiones distintas.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$dibujo$q$ and position = 6), 3, $q$6.3 Boca y cabello$q$, $q$Completa el rostro que empezaste en la lección 6.1.$q$);
insert into course_modules (course_slug, position, title) values ($q$dibujo$q$, 7, $q$Composición: planea tu dibujo final$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$dibujo$q$ and position = 7), 1, $q$7.1 Cómo elegir tu tema y tu referencia$q$, $q$Elige la foto u objeto que vas a dibujar en tu proyecto final.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$dibujo$q$ and position = 7), 2, $q$7.2 Boceto y encuadre$q$, $q$Haz 3 bocetos pequeños de tu idea antes de pasarla a limpio.$q$);
insert into course_modules (course_slug, position, title) values ($q$dibujo$q$, 8, $q$Tu primer dibujo terminado$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$dibujo$q$ and position = 8), 1, $q$8.1 De boceto a dibujo final$q$, $q$Pasa tu boceto elegido a una hoja limpia y empieza a trazar.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$dibujo$q$ and position = 8), 2, $q$8.2 Últimos detalles y acabado$q$, $q$Agrega texturas y sombras finales a tu dibujo.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$dibujo$q$ and position = 8), 3, $q$8.3 Cómo fotografiar y compartir tu trabajo$q$, $q$Fotografía tu dibujo terminado con luz natural y compártelo.$q$);
insert into courses (slug, title, category, short, promise, who, bullets, learn, extras, kit, grad, cover_path, price_cop, price_usd, status, sort_order) values ($q$pintura$q$, $q$Pintura Desde Cero$q$, $q$Pintura$q$, $q$Teoría del color y mezcla en acrílico, de paisajes a tu primer cuadro terminado.$q$, $q$Aprende a pintar en acrílico desde cero, de la teoría del color a tu primer cuadro terminado, con ejercicios cortos que puedes practicar hoy mismo.$q$, $q$Para quien quiere pintar pero no sabe qué materiales comprar ni cómo mezclar colores. Empezamos en acrílico por ser práctico y de secado rápido.$q$, array[$q$Círculo cromático y mezcla de color$q$, $q$Pinceles, técnicas, luces y sombras$q$, $q$20 ejercicios, plantillas y referencias$q$]::text[], array[$q$Entender el círculo cromático, los cálidos, los fríos y los complementarios$q$, $q$Mezclar el tono exacto que necesitas sin ensuciar el color$q$, $q$Elegir el pincel y la técnica para cada efecto: empaste, veladura y frotado seco$q$, $q$Dar volumen con pintura: luz, sombra y reflejos$q$, $q$Pintar paisajes con profundidad, flores y bodegones$q$, $q$Planear y terminar tu primer cuadro$q$]::text[], array[$q$20 ejercicios de color y pincelada adicionales$q$, $q$Círculo cromático y guía de mezclas para imprimir$q$, $q$Guía de materiales según tu presupuesto$q$, $q$Referencias de paisajes, flores y bodegones para practicar$q$, $q$Certificado digital de finalización$q$]::text[], array[$q$Acrílicos: los 3 colores primarios, blanco y negro$q$, $q$3 pinceles$q$, $q$Un lienzo o cartón entelado$q$]::text[], $q$g-paint$q$, null, 24000, 6, 'publicado', 20);
insert into course_modules (course_slug, position, title) values ($q$pintura$q$, 1, $q$Materiales y preparación$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$pintura$q$ and position = 1), 1, $q$1.1 Bienvenida a Pintura Desde Cero$q$, $q$Escribe qué te gustaría poder pintar en 9 semanas.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$pintura$q$ and position = 1), 2, $q$1.2 Materiales: pinturas, pinceles, superficies$q$, $q$Arma tu kit básico y fotografíalo.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$pintura$q$ and position = 1), 3, $q$1.3 Cómo preparar tu superficie y tu paleta$q$, $q$Prepara tu paleta de mezcla y deja lista tu superficie de trabajo.$q$);
insert into course_modules (course_slug, position, title) values ($q$pintura$q$, 2, $q$Teoría básica del color$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$pintura$q$ and position = 2), 1, $q$2.1 El círculo cromático: primarios, secundarios y terciarios$q$, $q$Dibuja tu propio círculo cromático mezclando solo los 3 colores primarios.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$pintura$q$ and position = 2), 2, $q$2.2 Temperatura del color: cálidos y fríos$q$, $q$Separa tu paleta en dos grupos, cálidos y fríos.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$pintura$q$ and position = 2), 3, $q$2.3 Colores complementarios y armonías$q$, $q$Pinta 3 franjas mezclando una pareja de complementarios en distinta proporción.$q$);
insert into course_modules (course_slug, position, title) values ($q$pintura$q$, 3, $q$Mezcla de colores$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$pintura$q$ and position = 3), 1, $q$3.1 Aclarar y oscurecer sin ensuciar el color$q$, $q$Crea una escala de 5 tonos de un mismo color.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$pintura$q$ and position = 3), 2, $q$3.2 Mezclar el tono exacto que necesitas$q$, $q$Intenta igualar el color de un objeto real que tengas en casa.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$pintura$q$ and position = 3), 3, $q$3.3 Errores comunes al mezclar (y cómo evitarlos)$q$, $q$Identifica un color «sucio» en tu paleta y corrígelo.$q$);
insert into course_modules (course_slug, position, title) values ($q$pintura$q$, 4, $q$Pinceles y trazos$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$pintura$q$ and position = 4), 1, $q$4.1 Qué pincel usar para cada efecto$q$, $q$Prueba los 3 pinceles de tu kit sobre una misma hoja y anota qué trazo hace cada uno.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$pintura$q$ and position = 4), 2, $q$4.2 Control de la muñeca: trazos largos, cortos y de presión variable$q$, $q$Llena una fila con trazos largos y otra con trazos cortos.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$pintura$q$ and position = 4), 3, $q$4.3 Técnicas básicas: empaste, veladura y frotado seco$q$, $q$Haz un cuadro de cada técnica sobre la misma hoja.$q$);
insert into course_modules (course_slug, position, title) values ($q$pintura$q$, 5, $q$Luces y sombras$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$pintura$q$ and position = 5), 1, $q$5.1 Aplicar volumen con pintura, no solo con lápiz$q$, $q$Pinta un cubo marcando su cara clara y su cara en sombra.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$pintura$q$ and position = 5), 2, $q$5.2 Sombra propia, proyectada y reflejo de luz en color$q$, $q$Pinta una esfera con degradado de tres tonos.$q$);
insert into course_modules (course_slug, position, title) values ($q$pintura$q$, 6, $q$Paisajes$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$pintura$q$ and position = 6), 1, $q$6.1 Cielo y horizonte: tu primer fondo$q$, $q$Pinta un cielo con degradado, de claro arriba a más oscuro en el horizonte.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$pintura$q$ and position = 6), 2, $q$6.2 Profundidad con capas de color$q$, $q$Agrega una montaña de fondo, en un tono más frío y difuso.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$pintura$q$ and position = 6), 3, $q$6.3 Montañas, árboles y agua simplificados$q$, $q$Completa tu paisaje con un primer plano de árboles o agua.$q$);
insert into course_modules (course_slug, position, title) values ($q$pintura$q$, 7, $q$Flores y naturaleza$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$pintura$q$ and position = 7), 1, $q$7.1 Formas orgánicas y pinceladas sueltas$q$, $q$Pinta 5 pétalos sueltos sin dibujarlos antes a lápiz.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$pintura$q$ and position = 7), 2, $q$7.2 Tu primera flor paso a paso$q$, $q$Pinta 3 flores del mismo tipo, de memoria, sin boceto previo.$q$);
insert into course_modules (course_slug, position, title) values ($q$pintura$q$, 8, $q$Objetos y composiciones$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$pintura$q$ and position = 8), 1, $q$8.1 Naturaleza muerta: cómo elegir y organizar tus objetos$q$, $q$Arma un bodegón sencillo con 2 o 3 objetos de tu casa.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$pintura$q$ and position = 8), 2, $q$8.2 Componer varios elementos en un mismo cuadro$q$, $q$Bosqueja tu bodegón antes de pintarlo, cuidando el espacio entre objetos.$q$);
insert into course_modules (course_slug, position, title) values ($q$pintura$q$, 9, $q$Proyecto final$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$pintura$q$ and position = 9), 1, $q$9.1 Planeación de tu cuadro final$q$, $q$Elige tu tema final y haz un boceto rápido de composición.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$pintura$q$ and position = 9), 2, $q$9.2 Ejecución: de la base al detalle$q$, $q$Pinta las capas base de tu cuadro final antes de entrar en detalle.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$pintura$q$ and position = 9), 3, $q$9.3 Últimos retoques y cómo fotografiar tu obra$q$, $q$Termina tu primer cuadro, fotografíalo con luz natural y compártelo.$q$);
insert into courses (slug, title, category, short, promise, who, bullets, learn, extras, kit, grad, cover_path, price_cop, price_usd, status, sort_order) values ($q$jabones$q$, $q$Jabones Artesanales$q$, $q$Jabones$q$, $q$Jabones de glicerina con diseño y presentación, más tus primeros pasos para venderlos.$q$, $q$Aprende a hacer jabones artesanales de glicerina, con diseño y presentación de nivel profesional, y da tus primeros pasos para venderlos.$q$, $q$Para quien quiere un pasatiempo o una idea de negocio con poca inversión. Usamos base de glicerina: no se manipula soda cáustica, así que es apto para principiantes.$q$, array[$q$Sin soda cáustica: apto para principiantes$q$, $q$Capas, inclusiones, empaque y etiquetas$q$, $q$22 ejercicios, costos y catálogo$q$]::text[], array[$q$Fundir la base de glicerina sin quemarla$q$, $q$Agregar aromas y colorantes en la proporción correcta$q$, $q$Desmoldar y cortar sin dañar el jabón$q$, $q$Hacer capas de color, inclusiones y formas$q$, $q$Empacar, etiquetar y fotografiar tu producto$q$, $q$Calcular costos y definir tu precio de venta$q$, $q$Crear una pequeña marca y dar tus primeras ventas$q$]::text[], array[$q$22 ejercicios extra organizados por módulo$q$, $q$Guía de materiales e ingredientes y dónde comprarlos$q$, $q$Checklist de higiene y organización del espacio$q$, $q$Plantillas de trabajo: ficha de costos, etiquetas, registro de lotes y catálogo$q$, $q$Hoja de costos y precio de venta$q$, $q$Certificado digital de finalización$q$]::text[], array[$q$Base de glicerina$q$, $q$Moldes$q$, $q$Colorantes y fragancias cosméticas$q$]::text[], $q$g-soap$q$, $q$jabones.jpg$q$, 24000, 6, 'publicado', 30);
insert into course_modules (course_slug, position, title) values ($q$jabones$q$, 1, $q$Introducción$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$jabones$q$ and position = 1), 1, $q$1.1 Bienvenida y tipos de jabón (glicerina vs. saponificación en frío)$q$, $q$Escribe para quién te gustaría hacer tu primer jabón: para ti, para regalar o para vender.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$jabones$q$ and position = 1), 2, $q$1.2 Herramientas e ingredientes básicos$q$, $q$Arma tu kit y fotografíalo.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$jabones$q$ and position = 1), 3, $q$1.3 Higiene y organización de tu espacio de trabajo$q$, $q$Organiza tu mesa de trabajo siguiendo la checklist de higiene del PDF.$q$);
insert into course_modules (course_slug, position, title) values ($q$jabones$q$, 2, $q$Jabones de glicerina$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$jabones$q$ and position = 2), 1, $q$2.1 Cómo fundir la base sin quemarla$q$, $q$Funde 200 g de base a baño María controlando la temperatura.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$jabones$q$ and position = 2), 2, $q$2.2 Aromas y colorantes: proporciones correctas$q$, $q$Agrega fragancia y color a tu base fundida siguiendo la tabla de proporciones.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$jabones$q$ and position = 2), 3, $q$2.3 Moldes y tiempos de secado$q$, $q$Vierte tu mezcla en un molde y registra la hora exacta de vaciado.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$jabones$q$ and position = 2), 4, $q$2.4 Corte y desmolde sin dañar el jabón$q$, $q$Desmolda y corta tu primera barra de jabón de un solo color.$q$);
insert into course_modules (course_slug, position, title) values ($q$jabones$q$, 3, $q$Diseños$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$jabones$q$ and position = 3), 1, $q$3.1 Capas de color$q$, $q$Haz un jabón de 2 capas, dejando enfriar la primera antes de verter la segunda.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$jabones$q$ and position = 3), 2, $q$3.2 Inclusiones: pétalos, avena, purpurina cosmética$q$, $q$Agrega una inclusión a tu próxima barra antes de que endurezca del todo.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$jabones$q$ and position = 3), 3, $q$3.3 Formas y combinaciones visuales$q$, $q$Combina un molde nuevo con capas o inclusiones en un mismo jabón.$q$);
insert into course_modules (course_slug, position, title) values ($q$jabones$q$, 4, $q$Presentación$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$jabones$q$ and position = 4), 1, $q$4.1 Empaque: qué proteger y cómo$q$, $q$Empaca uno de tus jabones ya terminados.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$jabones$q$ and position = 4), 2, $q$4.2 Etiquetas: qué información no puede faltar$q$, $q$Diseña la etiqueta de tu jabón con la plantilla.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$jabones$q$ and position = 4), 3, $q$4.3 Fotografía básica de producto con el celular$q$, $q$Fotografía tu jabón empacado y etiquetado con luz natural.$q$);
insert into course_modules (course_slug, position, title) values ($q$jabones$q$, 5, $q$Costos$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$jabones$q$ and position = 5), 1, $q$5.1 Costo por unidad: materia prima y empaque$q$, $q$Suma el costo real de materiales de tu último jabón.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$jabones$q$ and position = 5), 2, $q$5.2 Sumar tu mano de obra (sin regalarla)$q$, $q$Calcula cuánto vale tu tiempo por jabón según cuánto tardaste.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$jabones$q$ and position = 5), 3, $q$5.3 Definir precio de venta y margen$q$, $q$Define el precio de venta de tu jabón con la guía de costos.$q$);
insert into course_modules (course_slug, position, title) values ($q$jabones$q$, 6, $q$Creación de una pequeña marca$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$jabones$q$ and position = 6), 1, $q$6.1 Nombre e identidad$q$, $q$Escribe 3 posibles nombres para tu marca de jabones.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$jabones$q$ and position = 6), 2, $q$6.2 Catálogo de productos$q$, $q$Arma un catálogo de 3 productos con la plantilla.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$jabones$q$ and position = 6), 3, $q$6.3 Instagram y WhatsApp para tu marca$q$, $q$Crea o actualiza tu perfil con el nombre y catálogo que definiste.$q$);
insert into course_modules (course_slug, position, title) values ($q$jabones$q$, 7, $q$Primeras ventas$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$jabones$q$ and position = 7), 1, $q$7.1 Venta directa y regalos$q$, $q$Haz una lista de 5 personas a quienes podrías mostrarles tu primer jabón.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$jabones$q$ and position = 7), 2, $q$7.2 Mercados artesanales y ferias$q$, $q$Busca una feria o mercado artesanal cerca de ti y anota los requisitos para participar.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$jabones$q$ and position = 7), 3, $q$7.3 Redes sociales y paquetes/promociones$q$, $q$Publica tu primer producto en tu red social elegida.$q$);
insert into courses (slug, title, category, short, promise, who, bullets, learn, extras, kit, grad, cover_path, price_cop, price_usd, status, sort_order) values ($q$velas$q$, $q$Velas Artesanales$q$, $q$Velas$q$, $q$Velas de soja aromáticas con diseño y presentación, más tus primeros pasos para venderlas.$q$, $q$Aprende a hacer velas de soja aromáticas, con diseño y presentación de nivel profesional, y da tus primeros pasos para venderlas.$q$, $q$Para quien quiere un pasatiempo o una idea de negocio con poca inversión. Usamos cera de soja natural en envase de vidrio, sin parafina ni cera de abeja.$q$, array[$q$Cera de soja en envase de vidrio$q$, $q$Mechas, fragancia y tiempo de curado$q$, $q$Etiquetas con advertencia, costos y catálogo$q$]::text[], array[$q$Fundir la cera de soja sin quemarla$q$, $q$Elegir y centrar la mecha correcta$q$, $q$Agregar fragancia a la temperatura y proporción correctas$q$, $q$Verter y curar tu vela$q$, $q$Hacer capas, inclusiones y efecto marmoleado$q$, $q$Hacer una prueba de quemado y fotografiar tu producto$q$, $q$Calcular costos, crear tu marca y dar tus primeras ventas$q$]::text[], array[$q$Guía de materiales e ingredientes y dónde comprarlos$q$, $q$Checklist de seguridad y organización del espacio$q$, $q$Plantillas de etiquetas (con advertencia) y catálogo de productos$q$, $q$Hoja de costos y precio de venta$q$, $q$Certificado digital de finalización$q$]::text[], array[$q$Cera de soja$q$, $q$Mechas$q$, $q$Envases de vidrio y fragancias para velas$q$]::text[], $q$g-candle$q$, $q$velas.jpg$q$, 24000, 6, 'publicado', 40);
insert into course_modules (course_slug, position, title) values ($q$velas$q$, 1, $q$Introducción$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$velas$q$ and position = 1), 1, $q$1.1 Bienvenida y tipos de cera (soja vs. parafina vs. abeja)$q$, $q$Escribe para quién te gustaría hacer tu primera vela: para ti, para regalar o para vender.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$velas$q$ and position = 1), 2, $q$1.2 Herramientas e ingredientes básicos$q$, $q$Arma tu kit y fotografíalo.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$velas$q$ and position = 1), 3, $q$1.3 Seguridad y organización del espacio de trabajo$q$, $q$Organiza tu mesa de trabajo siguiendo la checklist de seguridad del PDF.$q$);
insert into course_modules (course_slug, position, title) values ($q$velas$q$, 2, $q$Velas de soja$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$velas$q$ and position = 2), 1, $q$2.1 Cómo fundir la cera sin quemarla$q$, $q$Funde 200 g de cera a baño María controlando la temperatura hasta 85 °C.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$velas$q$ and position = 2), 2, $q$2.2 Elegir y centrar la mecha correcta$q$, $q$Centra una mecha en un envase vacío antes de verter.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$velas$q$ and position = 2), 3, $q$2.3 Fragancia: temperatura y proporción correctas$q$, $q$Agrega fragancia a tu cera fundida siguiendo la tabla de proporciones.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$velas$q$ and position = 2), 4, $q$2.4 Vertido y tiempo de curado$q$, $q$Vierte tu primera vela y registra la fecha para curarla 1 o 2 semanas.$q$);
insert into course_modules (course_slug, position, title) values ($q$velas$q$, 3, $q$Diseños$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$velas$q$ and position = 3), 1, $q$3.1 Capas de color$q$, $q$Haz una vela de 2 capas, dejando enfriar la primera antes de verter la segunda.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$velas$q$ and position = 3), 2, $q$3.2 Inclusiones: flores secas, purpurina cosmética$q$, $q$Pega una flor seca contra el vidrio, lejos de la mecha.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$velas$q$ and position = 3), 3, $q$3.3 Efecto veteado o marmoleado$q$, $q$Combina 2 colores a distinta temperatura en un mismo envase.$q$);
insert into course_modules (course_slug, position, title) values ($q$velas$q$, 4, $q$Presentación$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$velas$q$ and position = 4), 1, $q$4.1 Envases: qué proteger y cómo elegirlos$q$, $q$Elige y prepara el envase para tu próxima vela.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$velas$q$ and position = 4), 2, $q$4.2 Etiquetas: qué información no puede faltar$q$, $q$Diseña la etiqueta de tu vela con la plantilla, incluida la advertencia de seguridad.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$velas$q$ and position = 4), 3, $q$4.3 Prueba de quemado y fotografía de producto$q$, $q$Haz una prueba de quemado de 2 horas y fotografía tu vela encendida y apagada.$q$);
insert into course_modules (course_slug, position, title) values ($q$velas$q$, 5, $q$Costos$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$velas$q$ and position = 5), 1, $q$5.1 Costo por unidad: materia prima y envase$q$, $q$Suma el costo real de materiales de tu última vela.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$velas$q$ and position = 5), 2, $q$5.2 Sumar tu mano de obra (sin regalarla)$q$, $q$Calcula cuánto vale tu tiempo por vela según cuánto tardaste.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$velas$q$ and position = 5), 3, $q$5.3 Definir precio de venta y margen$q$, $q$Define el precio de venta de tu vela con la guía de costos.$q$);
insert into course_modules (course_slug, position, title) values ($q$velas$q$, 6, $q$Creación de una pequeña marca$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$velas$q$ and position = 6), 1, $q$6.1 Nombre e identidad$q$, $q$Escribe 3 posibles nombres para tu marca de velas.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$velas$q$ and position = 6), 2, $q$6.2 Catálogo de productos$q$, $q$Arma un catálogo de 3 productos con la plantilla.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$velas$q$ and position = 6), 3, $q$6.3 Instagram y WhatsApp para tu marca$q$, $q$Crea o actualiza tu perfil con el nombre y catálogo que definiste.$q$);
insert into course_modules (course_slug, position, title) values ($q$velas$q$, 7, $q$Primeras ventas$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$velas$q$ and position = 7), 1, $q$7.1 Venta directa y regalos$q$, $q$Haz una lista de 5 personas a quienes podrías mostrarles tu primera vela.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$velas$q$ and position = 7), 2, $q$7.2 Mercados artesanales y ferias$q$, $q$Busca una feria o mercado artesanal cerca de ti y anota los requisitos para participar.$q$);
insert into course_lessons (module_id, position, title, exercise) values ((select id from course_modules where course_slug = $q$velas$q$ and position = 7), 3, $q$7.3 Redes sociales y paquetes/promociones$q$, $q$Publica tu primer producto en tu red social elegida.$q$);
insert into pricing_tiers (min_qty, percent_off) values (2, 25), (3, 33.33), (4, 41.77);
insert into bundles (code, name, description, slugs, price_cop, price_usd, featured, sort_order) values
  ('dibujo-pintura', $q$Dibujo + Pintura$q$, $q$Aprende a dibujar y a darle color a tus ideas.$q$, array['dibujo','pintura'], 29900, 7.5, false, 10),
  ('jabones-velas', $q$Jabones + Velas$q$, $q$Crea productos artesanales para regalar o vender.$q$, array['jabones','velas'], 29900, 7.5, false, 20),
  ('paquete-completo', $q$Paquete completo: las 4 guías$q$, $q$Dibujo, Pintura, Jabones y Velas, con todos los bonos y el certificado digital.$q$, array['dibujo','pintura','jabones','velas'], 55900, 14, true, 30);

notify pgrst, 'reload schema';
