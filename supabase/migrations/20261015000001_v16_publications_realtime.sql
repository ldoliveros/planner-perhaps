-- v1.6 — Publicaciones en vivo: agrega public.publications a supabase_realtime (crear / editar / mover / eliminar se
-- reflejan en las demás sesiones que miran el mismo calendario; lib/use-publications-live.ts).
--
-- Aplicada en QA (planner-qa-v16) el 2026-10-13 con el guard, tras dry-run OK. Producción: aplicar junto con el resto
-- de v1.6 antes del deploy. Solo cambia la publicación lógica `supabase_realtime`: no toca tablas, columnas,
-- políticas, grants ni datos. v1.5.1 no se suscribe a nada (inocua para v1.5.1).
--
-- Seguridad de los eventos (mismo criterio que 20261008000002):
--   * INSERT / UPDATE: Realtime los entrega solo a quien pasa la RLS de SELECT de publications
--     (publications_select_own para Client User, publications_manage para staff). Mismas columnas que ya entrega la
--     API a esos usuarios: no expone nada nuevo.
--   * DELETE: Realtime NO aplica RLS ni filtros a los DELETE; con REPLICA IDENTITY DEFAULT el evento contiene solo la
--     clave primaria (uuid). Cualquier usuario autenticado suscripto a DELETE puede ver ids de publicaciones borradas
--     de otros clientes (no su contenido). La app descarta todo id que no tenga en su lista local. Por eso esta
--     migración EXIGE replica identity DEFAULT (FULL filtraría la fila completa sin RLS).
-- Rollback: bloque RT de supabase/rollback/v1.6/rollback_v16.sql (o A5, que ya la incluye).
do $$
declare
  v_all_tables boolean;
  v_rls boolean;
  v_replident "char";
begin
  select p.puballtables into v_all_tables from pg_publication p where p.pubname = 'supabase_realtime';
  if not found then
    raise exception 'v16_publications_realtime: no existe la publicación supabase_realtime; abortado sin cambios.';
  end if;
  if v_all_tables is not false then
    raise exception 'v16_publications_realtime: supabase_realtime es FOR ALL TABLES; abortado sin cambios.';
  end if;

  select c.relrowsecurity, c.relreplident into v_rls, v_replident
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'publications';
  if not found then
    raise exception 'v16_publications_realtime: no existe public.publications; abortado sin cambios.';
  end if;
  if v_rls is not true then
    raise exception 'v16_publications_realtime: public.publications no tiene RLS activa; no se publica.';
  end if;
  if v_replident is distinct from 'd' then
    raise exception 'v16_publications_realtime: replica identity "%" (se espera DEFAULT); no se publica.', v_replident;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'publications'
  ) then
    alter publication supabase_realtime add table public.publications;
  end if;
end $$;
