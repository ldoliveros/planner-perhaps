-- Bucket privado para thumbnails/previews optimizadas (NO para originales).
-- Convención de path: {client_id}/{publication_id}/{asset_id}-{filename}
-- Migration idempotente: bucket con ON CONFLICT, policies dropeadas antes de recrearse.
insert into storage.buckets (id, name, public)
values ('thumbnails', 'thumbnails', false)
on conflict (id) do nothing;

drop policy if exists thumbnails_select on storage.objects;
create policy thumbnails_select on storage.objects
  for select using (
    bucket_id = 'thumbnails'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = public.current_client_id()::text
    )
  );

drop policy if exists thumbnails_admin_insert on storage.objects;
create policy thumbnails_admin_insert on storage.objects
  for insert with check (bucket_id = 'thumbnails' and public.is_admin());

drop policy if exists thumbnails_admin_update on storage.objects;
create policy thumbnails_admin_update on storage.objects
  for update using (bucket_id = 'thumbnails' and public.is_admin());

drop policy if exists thumbnails_admin_delete on storage.objects;
create policy thumbnails_admin_delete on storage.objects
  for delete using (bucket_id = 'thumbnails' and public.is_admin());
