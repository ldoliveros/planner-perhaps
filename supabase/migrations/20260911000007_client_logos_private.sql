-- El bucket público de logos daba "new row violates row-level security policy"
-- de forma intermitente en el upload (comportamiento no confiable de Storage
-- con buckets públicos + policies). Pasa a privado, mismo patrón ya probado
-- y estable que usa el bucket "thumbnails" (signed URLs resueltas server-side).
update storage.buckets set public = false where id = 'client-logos';

drop policy if exists client_logos_select on storage.objects;
create policy client_logos_select on storage.objects
  for select using (
    bucket_id = 'client-logos'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = public.current_client_id()::text
    )
  );
