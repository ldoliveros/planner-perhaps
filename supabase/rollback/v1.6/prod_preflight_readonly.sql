-- v1.6 — PRE-FLIGHT DE PRODUCCIÓN, SOLO LECTURA (no es una migración: nunca mover a supabase/migrations/).
-- Un único SELECT: no crea, modifica ni bloquea nada. Ejecutar 🔒 en el SQL Editor de producción
-- (`mglbzsysgsdrsbqlovwd`) antes de `db push`. Resultados esperados al lado de cada columna; cualquier diferencia =
-- detenerse y revisar (ver DEPLOY_RUNBOOK.md §3).
select
  -- Migraciones: producción en v1.5.1, sin nada de v1.6.
  (select max(version) from supabase_migrations.schema_migrations)                          as last_migration,      -- 20260926000001
  (select count(*) from supabase_migrations.schema_migrations where version >= '20261008')  as v16_migrations,      -- 0
  -- Objetos de v1.6 que todavía no deben existir (las migraciones abortan si ya existen).
  to_regclass('public.planner_feature_flags') is null
    and to_regclass('public.publication_comments') is null
    and to_regclass('public.notifications') is null
    and to_regclass('public.publication_changes') is null
    and to_regprocedure('public.collab_emails_enabled_for(uuid)') is null                     as v16_objects_absent,  -- true
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'publications'
          and column_name in ('trello_url', 'archived_at', 'archived_by'))                  as v16_columns_present, -- false
  -- Realtime: 20261008000002 / 20261015000001 / 20261017000002 exigen la publicación, sin FOR ALL TABLES.
  (select count(*) from pg_publication where pubname = 'supabase_realtime')                 as realtime_pub,        -- 1
  (select puballtables from pg_publication where pubname = 'supabase_realtime')             as realtime_all_tables, -- false
  (select coalesce(string_agg(tablename, ',' order by tablename), '') from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public')                          as realtime_tables,     -- '' (anotar si hay)
  -- publications: RLS activa y replica identity DEFAULT (guarda de 20261015000001).
  (select relrowsecurity from pg_class where oid = 'public.publications'::regclass)         as publications_rls,    -- true
  (select relreplident from pg_class where oid = 'public.publications'::regclass)           as publications_replident, -- d
  -- Estados que usa v1.6 (Tablero, flujo editorial, agenda).
  (select string_agg(key, ',' order by sort_order) from public.statuses)                    as status_keys,         -- draft,in_review,approved,published,discarded
  -- D2 (Notas internas fuera de v1.6): solo informativo.
  (select count(*) from public.publications where nullif(btrim(internal_notes), '') is not null) as rows_with_internal_notes,
  -- Extensiones y agenda: cómo corre hoy daily-agenda (cron) y si F5 podría instalarse más adelante.
  (select string_agg(extname, ',' order by extname) from pg_extension where extname in ('pg_cron', 'pg_net')) as cron_net_extensions,
  case when to_regclass('cron.job') is null then null
       else (xpath('/row/j/text()', query_to_xml(
         'select string_agg(jobname || '' @ '' || schedule, '' | '' order by jobname) as j from cron.job', false, false, '')))[1]::text
  end                                                                                       as cron_jobs,
  -- Volumen (para dimensionar la ventana y el backup).
  (select count(*) from public.publications)                                                as publications_total,
  (select count(*) from public.clients)                                                     as clients_total,
  -- QA Sandbox del proyecto compartido (para la activación controlada del flag).
  (select count(*) from public.clients where slug = 'qa-sandbox')                           as qa_sandbox_client;   -- 1
