-- Bucket público para logos de clientes (branding, no contenido sensible).
-- Path: {client_id}/logo-{timestamp}.webp
insert into storage.buckets (id, name, public)
values ('client-logos', 'client-logos', true)
on conflict (id) do nothing;

drop policy if exists client_logos_admin_insert on storage.objects;
create policy client_logos_admin_insert on storage.objects
  for insert with check (bucket_id = 'client-logos' and public.is_admin());

drop policy if exists client_logos_admin_update on storage.objects;
create policy client_logos_admin_update on storage.objects
  for update using (bucket_id = 'client-logos' and public.is_admin());

drop policy if exists client_logos_admin_delete on storage.objects;
create policy client_logos_admin_delete on storage.objects
  for delete using (bucket_id = 'client-logos' and public.is_admin());
