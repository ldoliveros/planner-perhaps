-- Fix: las policies de storage.objects para los buckets "thumbnails" y
-- "client-logos" (migrations 20260911000004/006/007) seguían usando
-- public.is_admin() (role = 'admin'), que 20260915000001_role_hierarchy.sql
-- dejó de cumplir para siempre (el rol pasó a 'super_admin'). Sin este fix,
-- ni Super Admin puede leer/escribir portadas o logos vía Storage.

-- ============================================================
-- THUMBNAILS — Account Manager necesita CRUD igual que en publications
-- (portada es parte de "crear/editar publicaciones"); Client User solo
-- lectura de su propio cliente. can_view_client()/can_manage_client() ya
-- cubren ambos casos en una sola llamada.
-- ============================================================
drop policy if exists thumbnails_select on storage.objects;
create policy thumbnails_select on storage.objects
  for select using (
    bucket_id = 'thumbnails'
    and public.can_view_client(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists thumbnails_admin_insert on storage.objects;
create policy thumbnails_manage_insert on storage.objects
  for insert with check (
    bucket_id = 'thumbnails'
    and public.can_manage_client(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists thumbnails_admin_update on storage.objects;
create policy thumbnails_manage_update on storage.objects
  for update using (
    bucket_id = 'thumbnails'
    and public.can_manage_client(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists thumbnails_admin_delete on storage.objects;
create policy thumbnails_manage_delete on storage.objects
  for delete using (
    bucket_id = 'thumbnails'
    and public.can_manage_client(((storage.foldername(name))[1])::uuid)
  );

-- ============================================================
-- CLIENT-LOGOS — crear/editar/eliminar clientes sigue siendo exclusivo de
-- Super Admin (igual que la tabla clients); Account Manager y Client User
-- solo necesitan LEER el logo (header, listados).
-- ============================================================
drop policy if exists client_logos_select on storage.objects;
create policy client_logos_select on storage.objects
  for select using (
    bucket_id = 'client-logos'
    and public.can_view_client(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists client_logos_admin_insert on storage.objects;
create policy client_logos_super_admin_insert on storage.objects
  for insert with check (bucket_id = 'client-logos' and public.is_super_admin());

drop policy if exists client_logos_admin_update on storage.objects;
create policy client_logos_super_admin_update on storage.objects
  for update using (bucket_id = 'client-logos' and public.is_super_admin());

drop policy if exists client_logos_admin_delete on storage.objects;
create policy client_logos_super_admin_delete on storage.objects
  for delete using (bucket_id = 'client-logos' and public.is_super_admin());
