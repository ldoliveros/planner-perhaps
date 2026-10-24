-- v1.6 — F2: publica en Supabase Realtime (postgres_changes) las tablas que la UI escucha en vivo.
--
-- PREPARADA, NO APLICADA. Vive fuera de supabase/migrations/ a propósito: se mueve ahí solo con
-- autorización explícita (paso separado de F1), así un `db push` no habilita Realtime por accidente.
-- Requiere 20261008000001_v16_collab_core.sql aplicada.
--
-- Publica EXCLUSIVAMENTE: public.notifications, public.publication_comments, public.publication_status_events.
-- Nunca: email_outbox, email_outbox_items, publication_comment_revisions (auditoría), planner_feature_flags.
--
-- Seguridad de los eventos:
--   * INSERT / UPDATE: Realtime entrega un cambio a un suscriptor solo si su RLS de SELECT lo permite (con su JWT
--     y el rol authenticated): notifications_select_own, publication_comments_select,
--     publication_status_events_select. NULL de can_view_client() en una policy = sin acceso.
--   * DELETE: NO asumir que pasa por las mismas comprobaciones RLS que INSERT/UPDATE — no las pasa. Y SÍ hay
--     borrados físicos: en cascada al eliminar una publicación, un cliente o un usuario (los comentarios que borra
--     la app son soft delete vía UPDATE, pero las cascadas son DELETE reales). Con REPLICA IDENTITY DEFAULT el
--     evento DELETE contiene ÚNICAMENTE la clave primaria (uuid): un suscriptor que pida eventos DELETE de estas
--     tablas puede ver ids borrados de otros clientes y cuándo, pero no su contenido. La app no se suscribe a
--     DELETE. Por eso esta migración EXIGE que ninguna tabla use REPLICA IDENTITY FULL (filtraría la fila vieja
--     completa en cada DELETE, sin RLS).
--
-- Guardas (fallan con excepción explícita ANTES de cualquier ALTER; todo corre en un único bloque DO dentro de la
-- transacción de la migración, así que un fallo no deja cambios parciales):
--   1) existe la publicación supabase_realtime y NO es FOR ALL TABLES;
--   2) ninguna tabla interna de v1.6 está ya publicada (outbox, auditoría, flags);
--   3) cada una de las 3 tablas existe, es una tabla común, tiene RLS activa y replica identity DEFAULT o INDEX
--      (FULL filtraría datos en DELETE; NOTHING rompería los UPDATE/DELETE de una tabla publicada).
-- Idempotente: solo agrega las tablas que todavía no están publicadas.
-- Rollback: supabase/rollback/v1.6/rollback_v16.sql, bloque A5 (quita solo estas 3 tablas, si están).
do $$
declare
  v_tables constant text[] := array['notifications', 'publication_comments', 'publication_status_events'];
  v_never_publish constant text[] := array['email_outbox', 'email_outbox_items', 'publication_comment_revisions', 'planner_feature_flags'];
  v_all_tables boolean;
  v_table text;
  v_relkind "char";
  v_rls boolean;
  v_replident "char";
  v_leaked text;
begin
  -- 1) Publicación existente y acotada.
  select p.puballtables into v_all_tables from pg_publication p where p.pubname = 'supabase_realtime';
  if not found then
    raise exception 'v16_realtime: no existe la publicación supabase_realtime; abortado sin cambios.';
  end if;
  if v_all_tables is not false then
    raise exception 'v16_realtime: supabase_realtime está definida FOR ALL TABLES (publica todo, incluidas tablas internas); abortado sin cambios.';
  end if;

  -- 2) Ninguna tabla interna de v1.6 publicada de antemano (p. ej. agregada a mano desde el Dashboard).
  select string_agg(pt.tablename, ', ' order by pt.tablename) into v_leaked
  from pg_publication_tables pt
  where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public' and pt.tablename = any (v_never_publish);
  if v_leaked is not null then
    raise exception 'v16_realtime: tablas internas ya publicadas en supabase_realtime (%); abortado sin cambios.', v_leaked;
  end if;

  -- 3) Validar las 3 tablas ANTES de publicar ninguna.
  foreach v_table in array v_tables loop
    select c.relkind, c.relrowsecurity, c.relreplident into v_relkind, v_rls, v_replident
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = v_table;

    if not found then
      raise exception 'v16_realtime: no existe public.% (¿F1 aplicada?); abortado sin cambios.', v_table;
    end if;
    if v_relkind is distinct from 'r' then
      raise exception 'v16_realtime: public.% no es una tabla común (relkind %); abortado sin cambios.', v_table, v_relkind;
    end if;
    if v_rls is not true then
      raise exception 'v16_realtime: public.% no tiene RLS activa; nunca se publica una tabla sin RLS. Abortado sin cambios.', v_table;
    end if;
    if v_replident = 'f' then
      raise exception 'v16_realtime: public.% usa REPLICA IDENTITY FULL (los DELETE transmitirían la fila completa sin RLS); abortado sin cambios.', v_table;
    end if;
    if v_replident is distinct from 'd' and v_replident is distinct from 'i' then
      raise exception 'v16_realtime: public.% tiene replica identity "%" (se espera DEFAULT o INDEX); abortado sin cambios.', v_table, v_replident;
    end if;
  end loop;

  -- Publicar solo lo que falta (idempotente).
  foreach v_table in array v_tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end $$;
