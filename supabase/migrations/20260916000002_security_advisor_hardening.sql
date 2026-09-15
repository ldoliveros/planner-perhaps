-- Fase 7 — hardening a partir de warnings reales de Supabase Security
-- Advisor (npx supabase db advisors --linked --type security). Migration
-- aditiva: no cambia SECURITY DEFINER/INVOKER, no borra funciones, no toca
-- policies existentes — solo ajusta search_path y privilegios de EXECUTE.

-- ============================================================
-- 1) FUNCTION SEARCH PATH MUTABLE
-- Todas las demás funciones propias (is_admin, current_client_id,
-- is_super_admin, has_assigned_client, can_manage_client, can_view_client,
-- protect_profiles, handle_new_user) ya declaran `set search_path = public`
-- desde que se crearon — revisado una por una, no hace falta tocarlas.
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_publication_client_id()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_client_id uuid;
begin
  select client_id into v_client_id from public.calendars where id = new.calendar_id;
  if v_client_id is null then
    raise exception 'calendar_id % no corresponde a un calendario existente', new.calendar_id;
  end if;
  new.client_id := v_client_id;
  return new;
end;
$$;

-- ============================================================
-- 2) SECURITY DEFINER callables vía /rest/v1/rpc/*
--
-- Auditoría (grep de pg_policies.qual/with_check en toda la base, ver
-- historial de esta conversación): de las 8 funciones marcadas por el
-- advisor, solo 4 aparecen referenciadas DIRECTAMENTE dentro de una policy
-- que se evalúa como el rol Postgres "authenticated" — a esas SE LES
-- MANTIENE el EXECUTE de authenticated a propósito, porque revocárselo
-- rompería esa policy para cualquier usuario autenticado (Postgres exige
-- EXECUTE sobre una función para invocarla dentro de una expresión de
-- policy, sin importar que sea SECURITY DEFINER):
--   - is_super_admin()      -> clients_super_admin_write, profiles_super_admin_all,
--                              user_client_assignments_super_admin_all,
--                              platforms/account_types/content_types/statuses_admin_write,
--                              thumbnails_manage_*, client_logos_super_admin_*
--   - current_client_id()   -> calendars/publications/client_accounts/
--                              publication_destinations/publication_assets _select_own
--   - can_manage_client(uuid) -> calendars/client_accounts/publications_manage,
--                                 publication_destinations/publication_assets_manage,
--                                 thumbnails_manage_*
--   - can_view_client(uuid)   -> clients_select_permitted, thumbnails_select,
--                                 client_logos_select
-- Quedan con EXECUTE revocado de anon (nunca lo necesitan: no hay ninguna
-- policy que le dé a `anon` acceso a estas tablas) pero SÍ mantienen
-- EXECUTE para `authenticated`.
--
-- Las otras 4 no aparecen referenciadas directamente en ninguna policy:
--   - has_assigned_client(uuid): solo se llama DESDE ADENTRO de
--     can_manage_client() (que es SECURITY DEFINER — esa llamada interna
--     corre con los privilegios del dueño de la función, no necesita que
--     "authenticated" tenga EXECUTE sobre ella).
--   - is_admin(): ya no la usa ninguna policy desde la migration de
--     jerarquía de roles — queda sin uso real, pero se conserva la función
--     (no se pidió borrarla) con el EXECUTE cerrado.
--   - handle_new_user() y protect_profiles(): son EXCLUSIVAMENTE funciones
--     de trigger (`after insert on auth.users` / `before update or delete
--     on profiles`) — el mecanismo de triggers invoca la función
--     directamente, no requiere que el rol que dispara el INSERT/UPDATE
--     tenga EXECUTE sobre ella.
-- Estas 4 quedan con EXECUTE revocado tanto de anon como de authenticated.
-- ============================================================

revoke execute on function public.is_admin() from public, anon, authenticated;
revoke execute on function public.is_super_admin() from public, anon, authenticated;
revoke execute on function public.current_client_id() from public, anon, authenticated;
revoke execute on function public.has_assigned_client(uuid) from public, anon, authenticated;
revoke execute on function public.can_manage_client(uuid) from public, anon, authenticated;
revoke execute on function public.can_view_client(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.protect_profiles() from public, anon, authenticated;

-- Re-otorgar únicamente a "authenticated" las 4 que sí necesita para que
-- sus propias policies (aplicadas sobre datos que SÍ le pertenecen) sigan
-- funcionando. "anon" no recibe nada: no hay ninguna policy que le dé
-- acceso a estas tablas, así que no lo necesita para nada legítimo.
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.current_client_id() to authenticated;
grant execute on function public.can_manage_client(uuid) to authenticated;
grant execute on function public.can_view_client(uuid) to authenticated;

-- ============================================================
-- 3) AVATARS — la policy de SELECT permitía listar/consultar storage.objects
-- del bucket completo vía la API normal (RLS-gated) de Storage. No hace
-- falta: al ser un bucket público, las imágenes se sirven por la ruta
-- pública de Storage (/storage/v1/object/public/avatars/...), que NO pasa
-- por RLS en absoluto. Se elimina — las policies de escritura (propia
-- carpeta {auth.uid()}/...) quedan intactas.
-- ============================================================
drop policy if exists avatars_select on storage.objects;
