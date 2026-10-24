-- v1.6 — Pruebas de 20261013000001_v16_comment_reads.sql (comentarios no leídos por usuario).
--
-- NO EJECUTAR sin autorización. Requiere la migración aplicada. Rol postgres (SQL Editor).
-- NO DEJA RASTRO: todo corre en una transacción que termina en ROLLBACK (publicación y comentarios temporales
-- incluidos). Una aserción fallida aborta con `raise exception 'FAIL CR..'`. Si todo pasa, el último NOTICE es
-- "v1.6 comment reads checks: OK". Solo usa los usuarios QA persistentes de CLAUDE.md.
-- Los comentarios temporales se insertan como postgres (sin RPC): no generan notificaciones.

begin;

-- ------------------------------------------------------------
-- Contexto (como postgres)
-- ------------------------------------------------------------
do $$
declare
  v_client uuid; v_calendar uuid; v_ct uuid; v_status uuid; v_pub uuid; v_other_pub uuid; v_foreign_pub uuid;
  v_cu uuid; v_am uuid; v_old uuid; v_am_new uuid; v_cu_new uuid; v_deleted uuid; v_other uuid;
begin
  select id into v_client from public.clients where slug = 'qa-sandbox';
  select id into v_calendar from public.calendars where client_id = v_client and name = 'QA General';
  select id into v_ct from public.content_types order by sort_order limit 1;
  select id into v_status from public.statuses where key = 'draft';
  select id into v_cu from public.profiles where email = 'qa-client-user@perhaps-planner-qa.com';
  select id into v_am from public.profiles where email = 'qa-account-manager@perhaps-planner-qa.com';
  select id into v_foreign_pub from public.publications where client_id <> v_client limit 1;
  if v_client is null or v_calendar is null or v_cu is null or v_am is null or v_status is null then
    raise exception 'SETUP: falta el entorno QA persistente (ver CLAUDE.md)';
  end if;
  if not exists (select 1 from public.user_client_assignments where user_id = v_am and client_id = v_client) then
    raise exception 'SETUP: el Account Manager QA no está asignado a QA Sandbox';
  end if;
  if v_foreign_pub is null then
    raise exception 'SETUP: no hay ninguna publicación de otro cliente para las pruebas negativas';
  end if;

  insert into public.publications (calendar_id, client_id, title, publication_date, content_type_id, status_id)
  values (v_calendar, v_client, 'QA v1.6 lecturas (temporal)', current_date, v_ct, v_status)
  returning id into v_pub;
  insert into public.publications (calendar_id, client_id, title, publication_date, content_type_id, status_id)
  values (v_calendar, v_client, 'QA v1.6 lecturas 2 (temporal)', current_date, v_ct, v_status)
  returning id into v_other_pub;

  -- Comentarios temporales. clock_timestamp(): posteriores a la inicialización aunque la migración se haya aplicado
  -- en esta misma transacción (dry-run).
  insert into public.publication_comments (publication_id, client_id, author_id, author_name, author_role, body, request_id, created_at)
  values (v_pub, v_client, v_am, 'QA AM', 'account_manager', 'viejo', gen_random_uuid(), public.comment_reads_baseline() - interval '1 day')
  returning id into v_old;
  insert into public.publication_comments (publication_id, client_id, author_id, author_name, author_role, body, request_id, created_at)
  values (v_pub, v_client, v_am, 'QA AM', 'account_manager', 'nuevo del AM', gen_random_uuid(), clock_timestamp() + interval '1 second')
  returning id into v_am_new;
  insert into public.publication_comments (publication_id, client_id, author_id, author_name, author_role, body, request_id, created_at)
  values (v_pub, v_client, v_cu, 'QA Cliente', 'client', 'nuevo del cliente', gen_random_uuid(), clock_timestamp() + interval '1 second')
  returning id into v_cu_new;
  insert into public.publication_comments (publication_id, client_id, author_id, author_name, author_role, body, request_id, created_at, deleted_at)
  values (v_pub, v_client, v_am, 'QA AM', 'account_manager', '', gen_random_uuid(), clock_timestamp() + interval '1 second', now())
  returning id into v_deleted;
  insert into public.publication_comments (publication_id, client_id, author_id, author_name, author_role, body, request_id, created_at)
  values (v_other_pub, v_client, v_am, 'QA AM', 'account_manager', 'otra publicación', gen_random_uuid(), clock_timestamp() + interval '1 second')
  returning id into v_other;

  -- La inicialización compara contra el alta del usuario: en QA los usuarios son anteriores a la migración.
  if (select created_at from public.profiles where id = v_cu) > clock_timestamp() then
    raise exception 'SETUP: alta del Client User QA en el futuro';
  end if;

  perform set_config('cr.pub', v_pub::text, true);
  perform set_config('cr.other_pub', v_other_pub::text, true);
  perform set_config('cr.foreign_pub', v_foreign_pub::text, true);
  perform set_config('cr.cu', v_cu::text, true);
  perform set_config('cr.am', v_am::text, true);
  perform set_config('cr.old', v_old::text, true);
  perform set_config('cr.am_new', v_am_new::text, true);
  perform set_config('cr.cu_new', v_cu_new::text, true);
  perform set_config('cr.deleted', v_deleted::text, true);
  perform set_config('cr.other', v_other::text, true);
end $$;

-- ------------------------------------------------------------
-- CLIENT USER QA
-- ------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', current_setting('cr.cu'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_pub uuid := current_setting('cr.pub')::uuid;
  v_unread uuid[];
  v_marked integer;
begin
  -- CR01: pendientes = solo el comentario ajeno, nuevo y no eliminado (sin el histórico, el propio ni el eliminado).
  select array_agg(comment_id) into v_unread from public.list_unread_publication_comments(v_pub);
  if v_unread is distinct from array[current_setting('cr.am_new')::uuid] then
    raise exception 'FAIL CR01: pendientes inesperados (%)', v_unread;
  end if;

  -- CR02: marcar solo crea constancias válidas: ignora el propio, el eliminado y el de otra publicación.
  v_marked := public.mark_publication_comments_read(v_pub, array[
    current_setting('cr.am_new')::uuid, current_setting('cr.cu_new')::uuid,
    current_setting('cr.deleted')::uuid, current_setting('cr.other')::uuid]);
  if v_marked <> 1 then
    raise exception 'FAIL CR02: se crearon % constancias (esperado 1)', v_marked;
  end if;
  if exists (select 1 from public.list_unread_publication_comments(v_pub)) then
    raise exception 'FAIL CR02b: quedaron pendientes después de marcar';
  end if;

  -- CR03: repetir la marca es inocuo; el comentario de la otra publicación sigue pendiente allí.
  if public.mark_publication_comments_read(v_pub, array[current_setting('cr.am_new')::uuid]) <> 0 then
    raise exception 'FAIL CR03: la marca repetida creó constancias';
  end if;
  if not exists (select 1 from public.list_unread_publication_comments(current_setting('cr.other_pub')::uuid)
                 where comment_id = current_setting('cr.other')::uuid) then
    raise exception 'FAIL CR03b: un id de otra publicación quedó marcado como leído';
  end if;

  -- CR04: constancias propias visibles por RLS.
  if not exists (select 1 from public.publication_comment_reads where comment_id = current_setting('cr.am_new')::uuid) then
    raise exception 'FAIL CR04: el usuario no ve su propia constancia';
  end if;

  -- CR05: publicación de otro cliente → sin permisos (lectura y escritura).
  begin
    perform 1 from public.list_unread_publication_comments(current_setting('cr.foreign_pub')::uuid);
    raise exception 'FAIL CR05a: listó pendientes de una publicación de otro cliente';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.mark_publication_comments_read(current_setting('cr.foreign_pub')::uuid, array[gen_random_uuid()]);
    raise exception 'FAIL CR05b: marcó en una publicación de otro cliente';
  exception when insufficient_privilege then null;
  end;

  -- CR06: sin escritura directa en la tabla (solo vía RPC).
  begin
    insert into public.publication_comment_reads (user_id, comment_id, publication_id, client_id)
    values (auth.uid(), current_setting('cr.other')::uuid, current_setting('cr.other_pub')::uuid,
            (select client_id from public.publications where id = current_setting('cr.other_pub')::uuid));
    raise exception 'FAIL CR06a: insert directo permitido';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.publication_comment_reads where user_id = auth.uid();
    raise exception 'FAIL CR06b: delete directo permitido';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ------------------------------------------------------------
-- ACCOUNT MANAGER QA: estado independiente; no ve las constancias del Client User
-- ------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', current_setting('cr.am'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_unread uuid[];
begin
  -- CR07: para el AM el pendiente es el comentario nuevo del cliente (la lectura del cliente no lo afecta).
  select array_agg(comment_id) into v_unread from public.list_unread_publication_comments(current_setting('cr.pub')::uuid);
  if v_unread is distinct from array[current_setting('cr.cu_new')::uuid] then
    raise exception 'FAIL CR07: pendientes del AM inesperados (%)', v_unread;
  end if;
  -- CR08: RLS — constancias de otro usuario invisibles.
  if exists (select 1 from public.publication_comment_reads where user_id = current_setting('cr.cu')::uuid) then
    raise exception 'FAIL CR08: el AM ve las constancias del Client User';
  end if;
end $$;
reset role;

-- ------------------------------------------------------------
-- Incorporación posterior (como postgres): si la asignación del AM a QA Sandbox fuera posterior al comentario, ese
-- comentario no es pendiente para él. Se simula moviendo la fecha de la asignación (se revierte con el ROLLBACK).
-- ------------------------------------------------------------
update public.user_client_assignments
set created_at = clock_timestamp() + interval '1 minute'
where user_id = current_setting('cr.am')::uuid
  and client_id = (select client_id from public.publications where id = current_setting('cr.pub')::uuid);

select set_config('request.jwt.claims', json_build_object('sub', current_setting('cr.am'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  -- CR10: comentarios anteriores a la incorporación al cliente no quedan pendientes.
  if exists (select 1 from public.list_unread_publication_comments(current_setting('cr.pub')::uuid)) then
    raise exception 'FAIL CR10: el AM ve como pendientes comentarios anteriores a su asignación';
  end if;
end $$;
reset role;

-- ------------------------------------------------------------
-- Grants (como postgres)
-- ------------------------------------------------------------
do $$
begin
  -- CR09: anon no ejecuta las RPCs; nadie de la API ejecuta la inicialización interna.
  if has_function_privilege('anon', 'public.mark_publication_comments_read(uuid, uuid[])', 'execute')
     or has_function_privilege('anon', 'public.list_unread_publication_comments(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.comment_reads_baseline()', 'execute')
     or has_table_privilege('anon', 'public.publication_comment_reads', 'select')
     or has_table_privilege('authenticated', 'public.publication_comment_reads', 'insert') then
    raise exception 'FAIL CR09: grants de más';
  end if;
  raise notice 'v1.6 comment reads checks: OK';
end $$;

rollback;
