-- v1.6 — Pruebas de 20261018000001_v16_pause_collab_emails.sql (emails de colaboración pausados hasta F5, pausa
-- dentro de enqueue_comment_digest y request_status_email).
--
-- NO EJECUTAR sin autorización. Requiere la migración aplicada (o el dry-run del guard, que la aplica dentro de la
-- misma transacción). Rol postgres.
-- NO DEJA RASTRO: todo termina en ROLLBACK (publicación, comentarios, notificaciones, flags y filas de prueba). Una
-- aserción fallida aborta con 'FAIL EM..'. Si todo pasa, el último NOTICE es "v1.6 collab emails checks: OK".
-- Solo usa los usuarios QA persistentes de CLAUDE.md.

begin;

-- ------------------------------------------------------------
-- Contexto (como postgres)
-- ------------------------------------------------------------
do $$
declare
  v_client uuid; v_calendar uuid; v_ct uuid; v_cu uuid; v_am uuid; v_rev uuid;
begin
  select id into v_client from public.clients where slug = 'qa-sandbox';
  select id into v_calendar from public.calendars where client_id = v_client and name = 'QA General';
  select id into v_ct from public.content_types order by sort_order limit 1;
  select id into v_cu from public.profiles where email = 'qa-client-user@perhaps-planner-qa.com';
  select id into v_am from public.profiles where email = 'qa-account-manager@perhaps-planner-qa.com';
  if v_client is null or v_calendar is null or v_cu is null or v_am is null then
    raise exception 'SETUP: falta el entorno QA persistente (ver CLAUDE.md)';
  end if;

  -- Notificaciones internas activas para QA Sandbox (como en QA); dentro de la transacción.
  update public.planner_feature_flags set enabled = false, client_ids = array[v_client] where key = 'v16_notifications';

  insert into public.publications (calendar_id, client_id, title, publication_date, content_type_id, status_id)
  values (v_calendar, v_client, 'QA v1.6 EM revisión (temporal)', current_date, v_ct, (select id from public.statuses where key = 'in_review'))
  returning id into v_rev;

  -- EM01: el flag existe y está apagado; la lectura da false para el cliente.
  if not exists (select 1 from public.planner_feature_flags where key = 'v16_collab_emails' and enabled = false and client_ids = '{}')
     or public.collab_emails_enabled_for(v_client) is not false then
    raise exception 'FAIL EM01: el flag v16_collab_emails no está creado apagado';
  end if;

  perform set_config('em.cu', v_cu::text, true);
  perform set_config('em.am', v_am::text, true);
  perform set_config('em.client', v_client::text, true);
  perform set_config('em.rev', v_rev::text, true);
  perform set_config('em.outbox_before', (select count(*) from public.email_outbox)::text, true);
  perform set_config('em.items_before', (select count(*) from public.email_outbox_items)::text, true);
  perform set_config('em.notif_before', (select count(*) from public.notifications)::text, true);
end $$;

-- ------------------------------------------------------------
-- Comentar, mencionar, responder y pedir aviso de estado — ACCOUNT MANAGER QA (emails pausados)
-- ------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', current_setting('em.am'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_rev uuid := current_setting('em.rev')::uuid;
  v_cu uuid := current_setting('em.cu')::uuid;
  v_first public.publication_comments%rowtype;
  v_reply public.publication_comments%rowtype;
  v_queued integer;
begin
  -- EM02: comentario con mención al Client User → se guarda.
  v_first := public.add_publication_comment(v_rev, 'con mención', array[v_cu], gen_random_uuid());
  if v_first.id is null then
    raise exception 'FAIL EM02: el comentario con mención no se guardó';
  end if;
  -- EM03: respuesta con mención → se guarda con su referencia.
  v_reply := public.add_publication_comment(v_rev, 'respuesta con mención', array[v_cu], gen_random_uuid(), v_first.id);
  if v_reply.id is null or v_reply.reply_to_comment_id is distinct from v_first.id then
    raise exception 'FAIL EM03: la respuesta no se guardó';
  end if;
  -- EM04: edición que agrega una mención → se guarda.
  perform public.edit_publication_comment(v_first.id, 'con mención editado', array[v_cu]);
  -- EM05: aviso de estado pedido directo por la API → 0 encolados, sin error.
  v_queued := public.request_status_email(v_rev, 'in_review', gen_random_uuid());
  if v_queued <> 0 then
    raise exception 'FAIL EM05: request_status_email encoló % emails con la pausa activa', v_queued;
  end if;
  if exists (select 1 from public.publication_status_events where publication_id = v_rev and email_requested) then
    raise exception 'FAIL EM05: request_status_email marcó email_requested con la pausa activa';
  end if;
end $$;
reset role;

-- ------------------------------------------------------------
-- Verificación de la pausa (como postgres)
-- ------------------------------------------------------------
do $$
declare
  v_client uuid := current_setting('em.client')::uuid;
  v_rev uuid := current_setting('em.rev')::uuid;
  v_cu uuid := current_setting('em.cu')::uuid;
begin
  -- EM06: ningún pendiente nuevo en el outbox ni ítems.
  if (select count(*) from public.email_outbox) <> current_setting('em.outbox_before')::bigint
     or (select count(*) from public.email_outbox_items) <> current_setting('em.items_before')::bigint then
    raise exception 'FAIL EM06: comentar/mencionar/responder/pedir aviso agregó filas a email_outbox con la pausa activa';
  end if;
  -- EM07: las notificaciones internas siguen funcionando (mención al Client User).
  if not exists (select 1 from public.notifications where recipient_id = v_cu and publication_id = v_rev and type = 'mention') then
    raise exception 'FAIL EM07: la mención no generó la notificación interna';
  end if;
  -- EM08: la pausa es específica de las dos funciones: un insert directo en email_outbox NO se toca (sin triggers).
  insert into public.email_outbox (kind, recipient_id, publication_id, client_id, send_after)
  values ('review_requested', v_cu, v_rev, v_client, now());
  if (select count(*) from public.email_outbox) <> current_setting('em.outbox_before')::bigint + 1 then
    raise exception 'FAIL EM08: un insert directo en email_outbox fue alterado';
  end if;
  if exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
             where c.relname in ('email_outbox', 'email_outbox_items') and not t.tgisinternal
               and pg_get_triggerdef(t.oid) ilike '%collab%') then
    raise exception 'FAIL EM08: hay triggers de pausa en el outbox';
  end if;
  perform set_config('em.outbox_before', (select count(*) from public.email_outbox)::text, true);
  -- EM09: ni anon ni authenticated ejecutan las funciones internas.
  if has_function_privilege('authenticated', 'public.collab_emails_enabled_for(uuid)', 'execute')
     or has_function_privilege('anon', 'public.collab_emails_enabled_for(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.enqueue_comment_digest(uuid, uuid, uuid, uuid, boolean)', 'execute')
     or has_function_privilege('anon', 'public.enqueue_comment_digest(uuid, uuid, uuid, uuid, boolean)', 'execute')
     or has_function_privilege('anon', 'public.request_status_email(uuid, text, uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.request_status_email(uuid, text, uuid)', 'execute') then
    raise exception 'FAIL EM09: grants de las funciones de emails alterados';
  end if;

  -- Reversibilidad (F5): encender el flag solo para QA Sandbox.
  update public.planner_feature_flags set client_ids = array[v_client] where key = 'v16_collab_emails';
end $$;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('em.am'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_row public.publication_comments%rowtype;
begin
  v_row := public.add_publication_comment(current_setting('em.rev')::uuid, 'con emails encendidos', array[current_setting('em.cu')::uuid], gen_random_uuid());
  if public.request_status_email(current_setting('em.rev')::uuid, 'in_review', gen_random_uuid()) < 1 then
    raise exception 'FAIL EM10: con v16_collab_emails encendido request_status_email no encoló';
  end if;
end $$;
reset role;

do $$
begin
  -- EM10: con el flag encendido vuelve a encolar (ventana + ítem): la pausa es solo el flag.
  if (select count(*) from public.email_outbox) <= current_setting('em.outbox_before')::bigint
     or (select count(*) from public.email_outbox_items) <= current_setting('em.items_before')::bigint then
    raise exception 'FAIL EM10: con v16_collab_emails encendido no se encoló el resumen';
  end if;
  raise notice 'v1.6 collab emails checks: OK';
end $$;

rollback;
