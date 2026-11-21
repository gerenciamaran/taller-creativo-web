-- ── Zona de alumnos de Academia Taller Creativo ──────────────────────────
-- Cuentas con código al correo (Supabase Auth), acceso por guía, progreso por lección y los PDF en un
-- almacenamiento privado. El acceso se guarda por CORREO (no por usuario): así se puede dar acceso antes de que
-- la persona entre por primera vez, y más adelante un aviso de pago (Wompi, Gumroad, Hotmart) solo necesita el
-- correo del comprador.
--   · enrollments      → qué guías tiene cada correo (se lee solo lo propio; escribe un administrador).
--   · lesson_progress  → lecciones que cada alumno marcó como hechas (solo las suyas y solo de guías que tiene).
--   · academy_admins   → correos que pueden dar o quitar acceso desde la pantalla de administración.
--   · bucket «guides»  → un PDF por guía (dibujo.pdf, pintura.pdf, jabones.pdf, velas.pdf), solo para quien la tiene.

create table academy_admins (
  email text primary key check (email = lower(btrim(email)))
);
alter table academy_admins enable row level security;
revoke all on academy_admins from anon, authenticated;
grant all on academy_admins to service_role;

create table enrollments (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(btrim(email)) and email like '%_@_%._%'),
  course_slug text not null check (course_slug in ('dibujo', 'pintura', 'jabones', 'velas')),
  source text not null default 'manual' check (source in ('manual', 'whatsapp', 'wompi', 'gumroad', 'hotmart')),
  note text check (note is null or char_length(note) <= 300),
  created_by text,
  created_at timestamptz not null default now(),
  unique (email, course_slug)
);
create index enrollments_email_idx on enrollments (email);
alter table enrollments enable row level security;

create table lesson_progress (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  course_slug text not null check (course_slug in ('dibujo', 'pintura', 'jabones', 'velas')),
  lesson_key text not null check (lesson_key ~ '^[0-9]{1,2}\.[0-9]{1,2}$'),
  done_at timestamptz not null default now(),
  primary key (user_id, course_slug, lesson_key)
);
alter table lesson_progress enable row level security;

-- Correo de quien tiene la sesión (verificado por el código que le llegó).
create or replace function jwt_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function is_academy_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from academy_admins a where a.email = jwt_email());
$$;

create or replace function has_course(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from enrollments e where e.email = jwt_email() and e.course_slug = p_slug);
$$;

-- Cada alumno ve sus guías; un administrador ve todas.
create policy "enrollments_select" on enrollments for select to authenticated
  using (email = jwt_email() or is_academy_admin());

create policy "lesson_progress_select" on lesson_progress for select to authenticated
  using (user_id = auth.uid());
create policy "lesson_progress_insert" on lesson_progress for insert to authenticated
  with check (user_id = auth.uid() and has_course(course_slug));
create policy "lesson_progress_delete" on lesson_progress for delete to authenticated
  using (user_id = auth.uid());

-- Dar acceso (administrador): una o varias guías a un correo. Devuelve cuántas guías nuevas quedaron.
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
    insert into enrollments (email, course_slug, source, note, created_by)
    values (v_email, v_slug, coalesce(p_source, 'manual'), nullif(btrim(coalesce(p_note, '')), ''), jwt_email())
    on conflict (email, course_slug) do nothing;
    get diagnostics v_added = row_count;
    v_new := v_new + v_added;
  end loop;
  return v_new;
end;
$$;

-- Quitar el acceso a una guía (administrador).
create or replace function revoke_access(p_email text, p_slug text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_academy_admin() then
    raise exception 'Solo un administrador puede quitar acceso.';
  end if;
  delete from enrollments where email = lower(btrim(coalesce(p_email, ''))) and course_slug = p_slug;
end;
$$;

revoke all on function grant_access(text, text[], text, text) from public, anon;
revoke all on function revoke_access(text, text) from public, anon;
revoke all on function is_academy_admin() from public, anon;
revoke all on function has_course(text) from public, anon;
grant execute on function grant_access(text, text[], text, text) to authenticated, service_role;
grant execute on function revoke_access(text, text) to authenticated, service_role;
grant execute on function is_academy_admin() to authenticated, service_role;
grant execute on function has_course(text) to authenticated, service_role;
grant execute on function jwt_email() to authenticated, service_role;

grant select on enrollments to authenticated;
grant select, insert, delete on lesson_progress to authenticated;
grant all on enrollments, lesson_progress to service_role;
revoke all on enrollments, lesson_progress from anon;

-- PDF de las guías: bucket privado; se leen solo si el correo de la sesión tiene esa guía.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('guides', 'guides', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

create policy "guides_read_if_enrolled" on storage.objects for select to authenticated
  using (bucket_id = 'guides' and has_course(split_part(name, '.', 1)));

-- Administrador inicial.
insert into academy_admins (email) values ('leonilo99@icloud.com') on conflict do nothing;
