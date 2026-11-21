-- ── Videos de las lecciones ───────────────────────────────────────────────
-- Un administrador sube el video de cada lección desde /admin; lo ve en su lección quien tiene esa guía.
--   · lesson_videos → qué archivo es el video de cada lección (guía + número de lección, por ejemplo «dibujo» y «1.2»).
--   · bucket «videos» (privado) → los archivos. Se leen con enlaces temporales y solo si el correo de la sesión tiene la guía.
--     La primera parte de la ruta es la guía (dibujo/1.2-....mp4), igual que en los PDF.

create table lesson_videos (
  course_slug text not null check (course_slug in ('dibujo', 'pintura', 'jabones', 'velas')),
  lesson_key text not null check (lesson_key ~ '^[0-9]{1,2}\.[0-9]{1,2}$'),
  video_path text not null,
  file_name text,
  size_bytes bigint,
  uploaded_by text default jwt_email(),
  created_at timestamptz not null default now(),
  primary key (course_slug, lesson_key)
);
alter table lesson_videos enable row level security;

-- Lo ve quien tiene la guía (y un administrador); lo escribe solo un administrador.
create policy "lesson_videos_select" on lesson_videos for select to authenticated
  using (has_course(course_slug) or is_academy_admin());
create policy "lesson_videos_insert" on lesson_videos for insert to authenticated
  with check (is_academy_admin() and split_part(video_path, '/', 1) = course_slug);
create policy "lesson_videos_update" on lesson_videos for update to authenticated
  using (is_academy_admin()) with check (is_academy_admin() and split_part(video_path, '/', 1) = course_slug);
create policy "lesson_videos_delete" on lesson_videos for delete to authenticated
  using (is_academy_admin());

grant select, insert, update, delete on lesson_videos to authenticated;
grant all on lesson_videos to service_role;
revoke all on lesson_videos from anon;

-- Bucket privado de videos (hasta 2 GB por archivo; MP4, WebM o MOV).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', false, 2147483648, array['video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "videos_read_if_enrolled" on storage.objects for select to authenticated
  using (bucket_id = 'videos' and (has_course(split_part(name, '/', 1)) or is_academy_admin()));
create policy "videos_admin_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'videos' and is_academy_admin());
create policy "videos_admin_update" on storage.objects for update to authenticated
  using (bucket_id = 'videos' and is_academy_admin()) with check (bucket_id = 'videos' and is_academy_admin());
create policy "videos_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'videos' and is_academy_admin());
