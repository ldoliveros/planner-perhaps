-- v1.6 — Retira publications.internal_notes (Notas internas dejó de ser parte de Planner; decisión de producto).
--
-- PREPARADA, NO APLICADA (pending-migrations/v1.6/). Se mueve a supabase/migrations/ y se aplica primero en QA con el
-- guard solo con autorización.
--
-- Por qué: la columna ya no la usa v1.6 (ni la lee, ni la muestra, ni la escribe) y, con la RLS por fila de
-- publications, el Client User podía leerla consultando la API directamente; con 20261015000001 (publicaciones en
-- Realtime) además viajaría en los eventos en vivo. Retirarla elimina esa exposición de raíz.
--
-- Compatibilidad con v1.5.1 (verificada en `main`): lee publications con `select *` y mapea la columna solo si viene
-- (sin ella queda `undefined` y no se muestra); su formulario no envía el campo, así que nunca la escribe; ninguna
-- consulta, función SQL, vista, política, trigger ni la Edge Function daily-agenda la nombran. → v1.5.1 sigue
-- funcionando con la columna retirada, también en un rollback.
--
-- IRREVERSIBLE para los datos: el contenido de las notas no se puede recuperar. Por seguridad, esta migración SE
-- NIEGA a correr si alguna fila tiene notas. Si en producción hay notas y se confirma que se descartan, vaciarlas
-- antes en un paso explícito y autorizado (`update public.publications set internal_notes = null where
-- internal_notes is not null;`) y recién después aplicar esta migración.
-- Rollback: bloque IN de supabase/rollback/v1.6/rollback_v16.sql (vuelve a crear la columna vacía; no recupera datos).
do $$
declare
  v_rows integer;
  v_deps text;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'publications' and column_name = 'internal_notes'
  ) then
    raise exception 'v16_drop_internal_notes: publications.internal_notes no existe (¿ya se aplicó?); abortado sin cambios.';
  end if;

  select count(*) into v_rows from public.publications where nullif(btrim(internal_notes), '') is not null;
  if v_rows > 0 then
    raise exception 'v16_drop_internal_notes: % publicaciones tienen notas internas; vaciarlas antes en un paso autorizado. Abortado sin cambios.', v_rows;
  end if;

  -- Nada de la base puede depender de la columna (vistas, funciones, políticas, triggers).
  select string_agg(dep, ', ') into v_deps from (
    select 'vista ' || view_name as dep from information_schema.view_column_usage
    where table_schema = 'public' and table_name = 'publications' and column_name = 'internal_notes'
    union all
    select 'función ' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosrc ilike '%internal_notes%'
    union all
    select 'política ' || policyname from pg_policies
    where schemaname = 'public' and (coalesce(qual, '') ilike '%internal_notes%' or coalesce(with_check, '') ilike '%internal_notes%')
    union all
    select 'trigger ' || t.tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where c.relname = 'publications' and not t.tgisinternal and pg_get_triggerdef(t.oid) ilike '%internal_notes%'
  ) d;
  if v_deps is not null then
    raise exception 'v16_drop_internal_notes: objetos que usan la columna (%); abortado sin cambios.', v_deps;
  end if;
end $$;

alter table public.publications drop column internal_notes;
