-- v1.6 — Prueba de INTEGRACIÓN del flujo de colaboración con los emails pausados (20261018000001).
--
-- Reemplaza la verificación manual en la interfaz: recorre el flujo completo con los usuarios QA persistentes y los
-- mismos caminos que usa la app (JWT del usuario + rol `authenticated`, así aplica la RLS): cambio de estado por
-- UPDATE condicional (setPublicationStatus), comentarios/respuestas/menciones por add_publication_comment, no leídos
-- por list_unread_publication_comments / mark_publication_comments_read, campanita por `notifications` (RLS: propias,
-- read_at nulo) / mark_notifications_read, aprobación del cliente por approve_publication_as_client y
-- request_status_email llamada directo.
--
-- NO EJECUTAR sin autorización. Rol postgres. NO DEJA RASTRO: todo termina en ROLLBACK. Una aserción fallida aborta
-- con 'FAIL IT..'. Si todo pasa, el último NOTICE es "v1.6 collab integration (emails paused): OK".
-- Cobertura que NO tiene (no se puede ejecutar desde SQL): render de la interfaz, Realtime (entrega de eventos a
-- navegadores) y los Server Actions de Next.js; la lógica que ejecutan sí (las mismas RPCs/consultas bajo RLS).

begin;

-- ------------------------------------------------------------
-- Contexto (como postgres)
-- ------------------------------------------------------------
do $$
declare
  v_client uuid; v_calendar uuid; v_ct uuid; v_cu uuid; v_am uuid; v_pub uuid;
begin
  select id into v_client from public.clients where slug = 'qa-sandbox';
  select id into v_calendar from public.calendars where client_id = v_client and name = 'QA General';
  select id into v_ct from public.content_types order by sort_order limit 1;
  select id into v_cu from public.profiles where email = 'qa-client-user@perhaps-planner-qa.com';
  select id into v_am from public.profiles where email = 'qa-account-manager@perhaps-planner-qa.com';
  if v_client is null or v_calendar is null or v_cu is null or v_am is null then
    raise exception 'SETUP: falta el entorno QA persistente (ver CLAUDE.md)';
  end if;
  -- Estado real de QA, sin forzarlo: notificaciones solo para QA Sandbox y emails de colaboración pausados.
  if public.notifications_enabled_for(v_client) is not true then
    raise exception 'SETUP: v16_notifications no está activo para QA Sandbox';
  end if;
  if public.collab_emails_enabled_for(v_client) is not false
     or not exists (select 1 from public.planner_feature_flags where key = 'v16_collab_emails' and not enabled and client_ids = '{}') then
    raise exception 'SETUP: v16_collab_emails no está apagado y sin clientes';
  end if;

  insert into public.publications (calendar_id, client_id, title, publication_date, content_type_id, status_id)
  values (v_calendar, v_client, 'QA v1.6 IT integración (temporal)', current_date, v_ct, (select id from public.statuses where key = 'draft'))
  returning id into v_pub;

  perform set_config('it.cu', v_cu::text, true);
  perform set_config('it.am', v_am::text, true);
  perform set_config('it.client', v_client::text, true);
  perform set_config('it.pub', v_pub::text, true);
  perform set_config('it.outbox', (select count(*) from public.email_outbox)::text, true);
  perform set_config('it.items', (select count(*) from public.email_outbox_items)::text, true);
  perform set_config('it.cu_unread', (select count(*) from public.notifications where recipient_id = v_cu and read_at is null)::text, true);
  perform set_config('it.am_unread', (select count(*) from public.notifications where recipient_id = v_am and read_at is null)::text, true);
end $$;

-- ------------------------------------------------------------
-- 1) Account Manager: envía a revisión (UPDATE condicional, como setPublicationStatus) y comenta.
-- ------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', current_setting('it.am'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_pub uuid := current_setting('it.pub')::uuid;
  v_rows integer;
  v_c1 public.publication_comments%rowtype;
begin
  update public.publications set status_id = (select id from public.statuses where key = 'in_review')
  where id = v_pub and status_id = (select id from public.statuses where key = 'draft');
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'FAIL IT01: el Account Manager no pudo enviar a revisión (filas %)', v_rows;
  end if;
  -- Comentario simple.
  v_c1 := public.add_publication_comment(v_pub, 'Comentario de la agencia', '{}', gen_random_uuid());
  if v_c1.id is null or v_c1.body <> 'Comentario de la agencia' then
    raise exception 'FAIL IT02: el comentario no se guardó';
  end if;
  perform set_config('it.c1', v_c1.id::text, true);
end $$;
reset role;

-- ------------------------------------------------------------
-- 2) Client User: responde al comentario.
-- ------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', current_setting('it.cu'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_reply public.publication_comments%rowtype;
begin
  v_reply := public.add_publication_comment(current_setting('it.pub')::uuid, 'Respuesta del cliente', '{}', gen_random_uuid(),
                                            current_setting('it.c1')::uuid);
  if v_reply.id is null or v_reply.reply_to_comment_id is distinct from current_setting('it.c1')::uuid then
    raise exception 'FAIL IT03: la respuesta no se guardó con su referencia';
  end if;
  perform set_config('it.c2', v_reply.id::text, true);
end $$;
reset role;

-- ------------------------------------------------------------
-- 3) Account Manager: comentario con mención válida al Client User.
-- ------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', current_setting('it.am'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_c3 public.publication_comments%rowtype;
  v_queued integer;
begin
  if not exists (select 1 from public.list_mentionable_members(current_setting('it.client')::uuid) m
                 where m.user_id = current_setting('it.cu')::uuid) then
    raise exception 'FAIL IT04: el Client User no figura como mencionable';
  end if;
  v_c3 := public.add_publication_comment(current_setting('it.pub')::uuid, 'Con mención al cliente',
                                         array[current_setting('it.cu')::uuid], gen_random_uuid());
  if v_c3.id is null then
    raise exception 'FAIL IT04: el comentario con mención no se guardó';
  end if;
  perform set_config('it.c3', v_c3.id::text, true);
  -- request_status_email llamada directo por la API: 0 encolados, sin error.
  v_queued := public.request_status_email(current_setting('it.pub')::uuid, 'in_review', gen_random_uuid());
  if v_queued <> 0 then
    raise exception 'FAIL IT08: request_status_email encoló % emails', v_queued;
  end if;
end $$;
reset role;

-- ------------------------------------------------------------
-- 4) Verificación de datos guardados, notificaciones y outbox (como postgres).
-- ------------------------------------------------------------
do $$
declare
  v_pub uuid := current_setting('it.pub')::uuid;
  v_cu uuid := current_setting('it.cu')::uuid;
  v_am uuid := current_setting('it.am')::uuid;
begin
  -- IT05: los tres comentarios guardados (no eliminados) en la publicación.
  if (select count(*) from public.publication_comments where publication_id = v_pub and deleted_at is null) <> 3 then
    raise exception 'FAIL IT05: se esperaban 3 comentarios guardados';
  end if;
  -- IT06: notificaciones internas esperadas.
  if not exists (select 1 from public.notifications where recipient_id = v_cu and publication_id = v_pub and type = 'review_requested') then
    raise exception 'FAIL IT06: falta la notificación de revisión al Client User';
  end if;
  if not exists (select 1 from public.notifications where recipient_id = v_am and publication_id = v_pub and type = 'comment'
                   and comment_id = current_setting('it.c2')::uuid) then
    raise exception 'FAIL IT06: falta la notificación de respuesta al Account Manager';
  end if;
  if not exists (select 1 from public.notifications where recipient_id = v_cu and publication_id = v_pub and type = 'mention'
                   and comment_id = current_setting('it.c3')::uuid) then
    raise exception 'FAIL IT06: falta la notificación de mención al Client User';
  end if;
  -- IT07: ningún registro nuevo en el outbox ni en sus ítems.
  if (select count(*) from public.email_outbox) <> current_setting('it.outbox')::bigint
     or (select count(*) from public.email_outbox_items) <> current_setting('it.items')::bigint then
    raise exception 'FAIL IT07: el flujo de colaboración agregó registros a email_outbox / email_outbox_items';
  end if;
  -- IT08: request_status_email no marcó el pedido de email en el historial.
  if exists (select 1 from public.publication_status_events where publication_id = v_pub and email_requested) then
    raise exception 'FAIL IT08: request_status_email marcó email_requested';
  end if;
end $$;

-- ------------------------------------------------------------
-- 5) Contadores como los ve el Client User (RLS): campanita y comentarios no leídos.
-- ------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', current_setting('it.cu'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_pub uuid := current_setting('it.pub')::uuid;
  v_unread_notif bigint;
  v_unread_comments uuid[];
  v_marked integer;
begin
  -- Campanita: +2 (revisión + mención) respecto del inicio; solo ve las propias.
  select count(*) into v_unread_notif from public.notifications where read_at is null;
  if v_unread_notif <> current_setting('it.cu_unread')::bigint + 2 then
    raise exception 'FAIL IT09: contador de la campanita del Client User = %, esperado %', v_unread_notif, current_setting('it.cu_unread')::bigint + 2;
  end if;
  -- Comentarios no leídos: los dos de la agencia (no la respuesta propia).
  select array_agg(comment_id order by comment_id) into v_unread_comments from public.list_unread_publication_comments(v_pub);
  if coalesce(array_length(v_unread_comments, 1), 0) <> 2
     or not (current_setting('it.c1')::uuid = any (v_unread_comments) and current_setting('it.c3')::uuid = any (v_unread_comments)) then
    raise exception 'FAIL IT09: comentarios no leídos del Client User inesperados: %', v_unread_comments;
  end if;
  -- Marcar como leídos (comentarios y notificaciones de esta publicación) actualiza los contadores.
  v_marked := public.mark_publication_comments_read(v_pub, v_unread_comments);
  if exists (select 1 from public.list_unread_publication_comments(v_pub)) then
    raise exception 'FAIL IT09: quedaron comentarios no leídos después de marcarlos';
  end if;
  perform public.mark_notifications_read(array(select id from public.notifications where publication_id = v_pub and read_at is null));
  if (select count(*) from public.notifications where read_at is null) <> current_setting('it.cu_unread')::bigint then
    raise exception 'FAIL IT09: la campanita no volvió a su valor inicial después de marcar leídas';
  end if;
  -- Sin permisos de agencia: request_status_email rechaza al Client User (comportamiento anterior intacto).
  begin
    perform public.request_status_email(v_pub, 'in_review', gen_random_uuid());
    raise exception 'FAIL IT10: el Client User pudo pedir un aviso de estado';
  exception when insufficient_privilege then null;
  end;
  -- Aprobación del cliente (otra notificación, por el trigger de estados): sigue funcionando.
  perform public.approve_publication_as_client(v_pub, (select updated_at from public.publications where id = v_pub));
end $$;
reset role;

-- ------------------------------------------------------------
-- 6) Otras notificaciones, permisos y outbox final (como postgres).
-- ------------------------------------------------------------
do $$
declare
  v_pub uuid := current_setting('it.pub')::uuid;
  v_am uuid := current_setting('it.am')::uuid;
begin
  -- IT10: la aprobación del cliente cambió el estado y notificó al Account Manager asignado.
  if (select s.key from public.publications p join public.statuses s on s.id = p.status_id where p.id = v_pub) <> 'approved' then
    raise exception 'FAIL IT10: la aprobación del cliente no cambió el estado';
  end if;
  if not exists (select 1 from public.notifications where recipient_id = v_am and publication_id = v_pub and type = 'approved_by_client') then
    raise exception 'FAIL IT10: falta la notificación de aprobación del cliente al Account Manager';
  end if;
  if (select count(*) from public.notifications where recipient_id = v_am and read_at is null) <> current_setting('it.am_unread')::bigint + 2 then
    raise exception 'FAIL IT10: contador del Account Manager inesperado (esperado +2: respuesta + aprobación)';
  end if;
  -- IT11: permisos de las funciones de emails y de colaboración intactos.
  if has_function_privilege('authenticated', 'public.enqueue_comment_digest(uuid, uuid, uuid, uuid, boolean)', 'execute')
     or has_function_privilege('anon', 'public.request_status_email(uuid, text, uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.request_status_email(uuid, text, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.collab_emails_enabled_for(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.add_publication_comment(uuid, text, uuid[], uuid, uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.approve_publication_as_client(uuid, timestamptz)', 'execute') then
    raise exception 'FAIL IT11: permisos de funciones alterados';
  end if;
  -- IT12: después de todo el flujo (incluida la aprobación), el outbox sigue igual.
  if (select count(*) from public.email_outbox) <> current_setting('it.outbox')::bigint
     or (select count(*) from public.email_outbox_items) <> current_setting('it.items')::bigint then
    raise exception 'FAIL IT12: el outbox cambió durante el flujo';
  end if;
  raise notice 'v1.6 collab integration (emails paused): OK';
end $$;

rollback;
