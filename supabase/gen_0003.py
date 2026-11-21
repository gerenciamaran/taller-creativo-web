#!/usr/bin/env python3
"""Genera supabase/migrations/0003_catalogo_en_base_de_datos.sql: el esquema nuevo + las 4 guías actuales como datos.

Uso (solo una vez; la migración ya generada es la que se aplica):  python supabase/gen_0003.py
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import build  # noqa: E402  (solo define COURSES; no genera nada)


def q(s):
    return "$q$" + s + "$q$"


def arr(items):
    return "array[" + ", ".join(q(i) for i in items) + "]::text[]" if items else "'{}'::text[]"


SCHEMA = r"""-- ── Catálogo de cursos en la base de datos ────────────────────────────────
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
"""


def main():
    out = [SCHEMA]
    for i, c in enumerate(build.COURSES):
        out.append(
            "insert into courses (slug, title, category, short, promise, who, bullets, learn, extras, kit, grad, cover_path, price_cop, price_usd, status, sort_order) values ("
            f"{q(c['slug'])}, {q(c['title'])}, {q(c['cat'])}, {q(c['short'])}, {q(c['promise'])}, {q(c['who'])}, {arr(c['bullets'])}, {arr(c['learn'])}, {arr(c['extras'])}, {arr(c['kit'])}, "
            f"{q(c['grad'])}, {q(c['slug'] + '.jpg') if c['slug'] != 'pintura' else 'null'}, 24000, 6, 'publicado', {(i + 1) * 10});\n"
        )
        for mi, (mname, lessons) in enumerate(c["modules"], 1):
            out.append(
                f"insert into course_modules (course_slug, position, title) values ({q(c['slug'])}, {mi}, {q(mname)});\n"
            )
            for li, (lt, lp) in enumerate(lessons, 1):
                out.append(
                    "insert into course_lessons (module_id, position, title, exercise) values ("
                    f"(select id from course_modules where course_slug = {q(c['slug'])} and position = {mi}), {li}, {q(lt)}, {q(lp)});\n"
                )
    out.append(
        "insert into pricing_tiers (min_qty, percent_off) values (2, 25), (3, 33.33), (4, 41.77);\n"
        "insert into bundles (code, name, description, slugs, price_cop, price_usd, featured, sort_order) values\n"
        f"  ('dibujo-pintura', {q('Dibujo + Pintura')}, {q('Aprende a dibujar y a darle color a tus ideas.')}, array['dibujo','pintura'], 29900, 7.5, false, 10),\n"
        f"  ('jabones-velas', {q('Jabones + Velas')}, {q('Crea productos artesanales para regalar o vender.')}, array['jabones','velas'], 29900, 7.5, false, 20),\n"
        f"  ('paquete-completo', {q('Paquete completo: las 4 guías')}, {q('Dibujo, Pintura, Jabones y Velas, con todos los bonos y el certificado digital.')}, array['dibujo','pintura','jabones','velas'], 55900, 14, true, 30);\n"
        "\nnotify pgrst, 'reload schema';\n"
    )
    path = os.path.join(ROOT, "supabase", "migrations", "0003_catalogo_en_base_de_datos.sql")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("".join(out))
    print("ok", path, sum(len(x) for x in out), "caracteres")


if __name__ == "__main__":
    main()
