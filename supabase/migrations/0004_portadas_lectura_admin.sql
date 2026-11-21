-- Corrige 0003: para borrar o reemplazar una portada, el administrador también necesita poder «ver» el objeto
-- (Supabase aplica la política de lectura al borrar). Las portadas siguen siendo públicas por URL.
create policy "covers_admin_read" on storage.objects for select to authenticated
  using (bucket_id = 'covers' and is_academy_admin());
