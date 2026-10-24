-- v1.6 — Pruebas de seguridad entre clientes y roles (RLS, grants, RPCs).
--
-- NO EJECUTAR sin autorización. Requiere 20261008000001_v16_collab_core.sql aplicada (y 000003 para la
-- sección de worker). Pensado para el SQL Editor de Supabase (rol postgres).
--
-- NO DEJA RASTRO: todo corre dentro de una transacción que termina en ROLLBACK (incluida la publicación
-- temporal de QA Sandbox). Cualquier aserción fallida aborta con `raise exception 'FAIL ...'` y la
-- transacción entera se revierte igual. Si todo pasa, el último NOTICE es "v1.6 security checks: OK".
--
-- Impersonación: `set local role` + `request.jwt.claims` (auth.uid() lee el claim `sub`). Entre actores
-- se vuelve a postgres con `reset role`. Solo usa los usuarios QA persistentes de CLAUDE.md; las
-- publicaciones de otros clientes solo se LEEN o se intentan modificar esperando un rechazo.

begin;

-- ------------------------------------------------------------
-- Contexto (como postgres)
-- ------------------------------------------------------------
do $$
declare
  v_client uuid; v_calendar uuid; v_ct uuid; v_in_review uuid; v_pub uuid; v_foreign_pub uuid; v_foreign_client uuid;
  v_qa_client_user uuid; v_qa_am uuid; v_qa_sa uuid; v_pub_comment_foreign uuid;
begin
  select id into v_client from public.clients where slug = 'qa-sandbox';
  select id into v_calendar from public.calendars where client_id = v_client and name = 'QA General';
  select id into v_ct from public.content_types order by sort_order limit 1;
  select id into v_in_review from public.statuses where key = 'in_review';
  select id into v_qa_client_user from public.profiles where email = 'qa-client-user@perhaps-planner-qa.com';
  select id into v_qa_am from public.profiles where email = 'qa-account-manager@perhaps-planner-qa.com';
  select id into v_qa_sa from public.profiles where email = 'qa-super-admin@perhaps-planner-qa.com';
  select id, client_id into v_foreign_pub, v_foreign_client from public.publications where client_id <> v_client limit 1;

  if v_client is null or v_calendar is null or v_qa_client_user is null or v_qa_am is null or v_qa_sa is null then
    raise exception 'SETUP: falta el entorno QA persistente (ver CLAUDE.md)';
  end if;
  if v_foreign_pub is null then
    raise exception 'SETUP: no hay ninguna publicación de otro cliente para las pruebas negativas';
  end if;
  if exists (select 1 from public.user_client_assignments where user_id = v_qa_am and client_id = v_foreign_client) then
    raise exception 'SETUP: el AM QA está asignado al cliente "ajeno" elegido; elegir otro';
  end if;

  -- Activación (T00a): nunca global (`enabled = false`) y, como mucho, habilitado SOLO para QA Sandbox — el estado
  -- de QA mientras se prueba la campanita. Cualquier activación global o para otro cliente falla.
  if not exists (
    select 1 from public.planner_feature_flags
    where key = 'v16_notifications'
      and enabled = false
      and (client_ids = '{}'::uuid[] or client_ids = array[v_client])
  ) then
    raise exception 'FAIL T00a: v16_notifications activo globalmente o habilitado para clientes distintos de QA Sandbox';
  end if;
  -- Con el flag apagado, el historial se registra igual pero NO se crea ninguna notificación. Se apaga SOLO dentro
  -- de esta transacción (el ROLLBACK final restaura la configuración real de QA, que no hace falta tocar).
  update public.planner_feature_flags set client_ids = '{}' where key = 'v16_notifications';
  if public.notifications_enabled_for(v_client) then
    raise exception 'FAIL T00a2: con client_ids vacío el flag sigue activo para QA Sandbox';
  end if;
  insert into public.publications (calendar_id, client_id, title, publication_date, content_type_id, status_id)
  values (v_calendar, v_client, 'QA v1.6 flag apagado (temporal)', current_date, v_ct, v_in_review)
  returning id into v_pub;
  if not exists (select 1 from public.publication_status_events where publication_id = v_pub) then
    raise exception 'FAIL T00b: con el flag apagado no se registró el historial de estados';
  end if;
  if exists (select 1 from public.notifications where publication_id = v_pub) then
    raise exception 'FAIL T00c: con el flag apagado se crearon notificaciones';
  end if;

  -- Activación SOLO para QA Sandbox (dentro de esta transacción; se revierte con el ROLLBACK final).
  update public.planner_feature_flags set client_ids = array[v_client] where key = 'v16_notifications';
  if not public.notifications_enabled_for(v_client) or public.notifications_enabled_for(v_foreign_client) then
    raise exception 'FAIL T00d: la activación por cliente no quedó limitada a QA Sandbox';
  end if;

  -- Publicación temporal En revisión (se revierte con el ROLLBACK final). El trigger corre sin auth.uid().
  insert into public.publications (calendar_id, client_id, title, publication_date, content_type_id, status_id)
  values (v_calendar, v_client, 'QA v1.6 security check (temporal)', current_date, v_ct, v_in_review)
  returning id into v_pub;

  perform set_config('v16.client', v_client::text, true);
  perform set_config('v16.pub', v_pub::text, true);
  perform set_config('v16.foreign_pub', v_foreign_pub::text, true);
  perform set_config('v16.foreign_client', v_foreign_client::text, true);
  perform set_config('v16.qa_client_user', v_qa_client_user::text, true);
  perform set_config('v16.qa_am', v_qa_am::text, true);
  perform set_config('v16.qa_sa', v_qa_sa::text, true);

  -- Comentario del AM QA en la publicación de OTRO cliente (insertado como postgres; se revierte al final).
  -- Aísla el chequeo de acceso: el AM es el autor, así que solo can_view_client() — que para staff sin
  -- asignación devuelve NULL, no false — puede rechazar editar/eliminar (T42b/T42c).
  insert into public.publication_comments (publication_id, client_id, author_id, author_name, author_role, body, request_id)
  select v_foreign_pub, v_foreign_client, v_qa_am, 'QA Account Manager', 'account_manager', 'comentario ajeno (temporal)', gen_random_uuid()
  returning id into v_pub_comment_foreign;
  perform set_config('v16.foreign_am_comment', v_pub_comment_foreign::text, true);

  -- Trigger: evento registrado + review_requested al Client User QA.
  if not exists (select 1 from public.publication_status_events where publication_id = v_pub and to_status_id = v_in_review) then
    raise exception 'FAIL T00: no se registró el evento de estado al crear En revisión';
  end if;
  if not exists (select 1 from public.notifications where publication_id = v_pub and recipient_id = v_qa_client_user and type = 'review_requested') then
    raise exception 'FAIL T01: el Client User QA no recibió review_requested';
  end if;
end $$;

-- ------------------------------------------------------------
-- ANON: sin acceso a nada nuevo
-- ------------------------------------------------------------
set local role anon;
do $$
begin
  begin
    perform 1 from public.notifications limit 1;
    raise exception 'FAIL T02: anon pudo leer notifications';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.add_publication_comment(current_setting('v16.pub')::uuid, 'x', '{}', gen_random_uuid());
    raise exception 'FAIL T03: anon pudo ejecutar add_publication_comment';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ------------------------------------------------------------
-- CLIENT USER QA
-- ------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', current_setting('v16.qa_client_user'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_pub uuid := current_setting('v16.pub')::uuid;
  v_foreign_pub uuid := current_setting('v16.foreign_pub')::uuid;
  v_foreign_client uuid := current_setting('v16.foreign_client')::uuid;
  v_me uuid := current_setting('v16.qa_client_user')::uuid;
  v_n integer;
  v_c public.publication_comments%rowtype;
  v_req uuid := gen_random_uuid();
begin
  -- Aislamiento de lectura
  select count(*) into v_n from public.publications where id = v_foreign_pub;
  if v_n <> 0 then raise exception 'FAIL T10: client ve una publicación de otro cliente'; end if;
  select count(*) into v_n from public.publication_comments where client_id = v_foreign_client;
  if v_n <> 0 then raise exception 'FAIL T11: client ve comentarios de otro cliente'; end if;
  select count(*) into v_n from public.publication_status_events where client_id = v_foreign_client;
  if v_n <> 0 then raise exception 'FAIL T12: client ve historial de otro cliente'; end if;
  select count(*) into v_n from public.notifications where recipient_id <> v_me;
  if v_n <> 0 then raise exception 'FAIL T13: client ve notificaciones ajenas'; end if;
  select count(*) into v_n from public.list_mentionable_members(v_foreign_client);
  if v_n <> 0 then raise exception 'FAIL T14: client lista miembros de otro cliente'; end if;

  -- Tablas internas cerradas
  begin perform 1 from public.email_outbox limit 1; raise exception 'FAIL T15: client lee email_outbox';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.publication_comment_revisions limit 1; raise exception 'FAIL T16: client lee revisions';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.planner_feature_flags limit 1; raise exception 'FAIL T16b: client lee planner_feature_flags';
  exception when insufficient_privilege then null; end;
  begin perform public.notifications_enabled_for(current_setting('v16.client')::uuid);
    raise exception 'FAIL T16c: authenticated ejecutó notifications_enabled_for';
  exception when insufficient_privilege then null; end;

  -- Sin escritura directa
  begin
    insert into public.publication_comments (publication_id, client_id, author_name, author_role, body, request_id)
    values (v_pub, current_setting('v16.client')::uuid, 'x', 'client', 'x', gen_random_uuid());
    raise exception 'FAIL T17: client insertó un comentario directo';
  exception when insufficient_privilege then null; end;
  begin
    update public.notifications set read_at = now() where recipient_id = v_me;
    raise exception 'FAIL T18: client actualizó notifications directo';
  exception when insufficient_privilege then null; end;
  begin
    update public.publications set title = 'hack' where id = v_pub;
    get diagnostics v_n = row_count;
    if v_n <> 0 then raise exception 'FAIL T19: client editó una publicación'; end if;
  exception when insufficient_privilege then null; end;

  -- RPCs sobre otro cliente
  begin perform public.add_publication_comment(v_foreign_pub, 'x', '{}', gen_random_uuid());
    raise exception 'FAIL T20: client comentó en otro cliente';
  exception when insufficient_privilege then null; end;
  begin perform public.approve_publication_as_client(v_foreign_pub, now());
    raise exception 'FAIL T21: client aprobó en otro cliente';
  exception when insufficient_privilege then null; end;
  begin perform public.request_status_email(v_pub, 'in_review', gen_random_uuid());
    raise exception 'FAIL T22: client pidió un email de estado';
  exception when insufficient_privilege then null; end;

  -- Comentario propio + idempotencia + mención a un usuario de otro cliente (se descarta)
  v_c := public.add_publication_comment(v_pub, 'Hola desde QA', array[current_setting('v16.qa_am')::uuid, gen_random_uuid()], v_req);
  perform public.add_publication_comment(v_pub, 'Hola desde QA', '{}', v_req);
  select count(*) into v_n from public.publication_comments where publication_id = v_pub and request_id = v_req;
  if v_n <> 1 then raise exception 'FAIL T23: request_id no fue idempotente'; end if;
  select count(*) into v_n from public.publication_comment_mentions where comment_id = v_c.id;
  if v_n > 1 then raise exception 'FAIL T24: se aceptó una mención a un usuario no miembro'; end if;

  perform set_config('v16.client_comment', v_c.id::text, true);

  -- Aprobación con una versión vieja (la agencia guardó después): rechazada sin modificar nada.
  begin perform public.approve_publication_as_client(v_pub, (select updated_at - interval '1 second' from public.publications where id = v_pub));
    raise exception 'FAIL T28: aprobación aceptada sobre una versión desactualizada';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  if not exists (select 1 from public.publications p join public.statuses s on s.id = p.status_id
                 where p.id = v_pub and s.key = 'in_review') then
    raise exception 'FAIL T29: la aprobación rechazada modificó el estado';
  end if;

  -- Aprobación del cliente sobre la versión vigente: una vez sí, la segunda no; después no se puede comentar.
  perform public.approve_publication_as_client(v_pub, (select updated_at from public.publications where id = v_pub));
  begin perform public.approve_publication_as_client(v_pub, (select updated_at from public.publications where id = v_pub));
    raise exception 'FAIL T25: segunda aprobación aceptada';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin perform public.add_publication_comment(v_pub, 'tarde', '{}', gen_random_uuid());
    raise exception 'FAIL T26: comentario aceptado fuera de En revisión';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;

  -- Worker inaccesible
  begin perform public.claim_email_outbox(1);
    raise exception 'FAIL T27: authenticated ejecutó claim_email_outbox';
  exception when insufficient_privilege or undefined_function then null; end;
end $$;
reset role;

-- Verificación como postgres: registro de aprobación con usuario y rol.
do $$
begin
  if not exists (
    select 1 from public.publication_status_events e join public.statuses s on s.id = e.to_status_id
    where e.publication_id = current_setting('v16.pub')::uuid and s.key = 'approved'
      and e.actor_id = current_setting('v16.qa_client_user')::uuid and e.actor_role = 'client'
  ) then
    raise exception 'FAIL T30: la aprobación del cliente no registró usuario/rol';
  end if;
  if exists (
    select 1 from public.notifications
    where publication_id = current_setting('v16.pub')::uuid and recipient_id = actor_id
  ) then
    raise exception 'FAIL T31: un actor recibió su propia notificación';
  end if;
end $$;

-- ------------------------------------------------------------
-- ACCOUNT MANAGER QA (asignado solo a QA Sandbox)
-- ------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', current_setting('v16.qa_am'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_pub uuid := current_setting('v16.pub')::uuid;
  v_me uuid := current_setting('v16.qa_am')::uuid;
  v_n integer;
  v_c public.publication_comments%rowtype;
begin
  -- Reabre la revisión (Aprobado -> En revisión) por RLS normal.
  update public.publications set status_id = (select id from public.statuses where key = 'in_review') where id = v_pub;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'FAIL T40: AM no pudo volver a En revisión'; end if;

  -- El historial sigue ahí.
  select count(*) into v_n from public.publication_comments where publication_id = v_pub;
  if v_n < 1 then raise exception 'FAIL T41: se perdió el historial al reabrir'; end if;

  -- Otro cliente: rechazado.
  begin perform public.add_publication_comment(current_setting('v16.foreign_pub')::uuid, 'x', '{}', gen_random_uuid());
    raise exception 'FAIL T42: AM comentó en un cliente no asignado';
  exception when insufficient_privilege then null; end;

  -- Caso NULL de can_view_client (staff sin asignación): ni siquiera su PROPIO comentario en otro cliente.
  begin perform public.edit_publication_comment(current_setting('v16.foreign_am_comment')::uuid, 'pisado', '{}');
    raise exception 'FAIL T42b: AM editó un comentario en un cliente no asignado (NULL de can_view_client)';
  exception when insufficient_privilege then null; end;
  begin perform public.delete_publication_comment(current_setting('v16.foreign_am_comment')::uuid);
    raise exception 'FAIL T42c: AM eliminó un comentario en un cliente no asignado (NULL de can_view_client)';
  exception when insufficient_privilege then null; end;
  -- Lecturas del cliente no asignado: RLS (NULL = sin acceso) y mencionables.
  select count(*) into v_n from public.publication_comments where client_id = current_setting('v16.foreign_client')::uuid;
  if v_n <> 0 then raise exception 'FAIL T42d: AM lee comentarios de un cliente no asignado'; end if;
  select count(*) into v_n from public.list_mentionable_members(current_setting('v16.foreign_client')::uuid);
  if v_n <> 0 then raise exception 'FAIL T42e: AM lista mencionables de un cliente no asignado'; end if;
  begin perform public.request_status_email(current_setting('v16.foreign_pub')::uuid, 'in_review', gen_random_uuid());
    raise exception 'FAIL T42f: AM pidió un email de estado en un cliente no asignado';
  exception when insufficient_privilege then null; end;

  -- No puede editar ni borrar comentarios ajenos.
  begin perform public.edit_publication_comment(current_setting('v16.client_comment')::uuid, 'pisado', '{}');
    raise exception 'FAIL T43: AM editó un comentario ajeno';
  exception when insufficient_privilege then null; end;
  begin perform public.delete_publication_comment(current_setting('v16.client_comment')::uuid);
    raise exception 'FAIL T44: AM eliminó un comentario ajeno';
  exception when insufficient_privilege then null; end;

  -- Mencionables: nunca él mismo; todos miembros del cliente.
  select count(*) into v_n from public.list_mentionable_members(current_setting('v16.client')::uuid) where user_id = v_me;
  if v_n <> 0 then raise exception 'FAIL T45: el usuario se lista a sí mismo como mencionable'; end if;

  -- Comentario con mención al cliente; luego editar y eliminar el propio.
  v_c := public.add_publication_comment(v_pub, 'Respuesta AM @cliente', array[current_setting('v16.qa_client_user')::uuid], gen_random_uuid());
  perform public.edit_publication_comment(v_c.id, 'Respuesta AM editada', array[current_setting('v16.qa_client_user')::uuid]);
  perform public.delete_publication_comment(v_c.id);
  perform set_config('v16.am_comment', v_c.id::text, true);

  -- Pedido de email de revisión (solo encola; idempotente por request_id).
  perform set_config('v16.req', gen_random_uuid()::text, true);
  perform public.request_status_email(v_pub, 'in_review', current_setting('v16.req')::uuid);
  perform public.request_status_email(v_pub, 'in_review', current_setting('v16.req')::uuid);
end $$;
reset role;

-- Verificación como postgres: auditoría, dedupe de ventanas y de pedidos de email.
do $$
declare
  v_n integer;
  v_pub uuid := current_setting('v16.pub')::uuid;
begin
  select count(*) into v_n from public.publication_comments
  where id = current_setting('v16.am_comment')::uuid and deleted_at is not null and body = '';
  if v_n <> 1 then raise exception 'FAIL T50: el soft delete dejó texto legible'; end if;

  select count(*) into v_n from public.publication_comment_revisions
  where comment_id = current_setting('v16.am_comment')::uuid;
  if v_n <> 2 then raise exception 'FAIL T51: faltan revisiones (esperadas: edit + delete), hay %', v_n; end if;

  select count(*) into v_n from (
    select recipient_id, publication_id from public.email_outbox
    where kind = 'comment_digest' and status = 'pending' and publication_id = v_pub
    group by 1, 2 having count(*) > 1
  ) d;
  if v_n <> 0 then raise exception 'FAIL T52: más de una ventana pendiente por destinatario+publicación'; end if;

  select count(*) into v_n from (
    select recipient_id from public.email_outbox
    where request_id = current_setting('v16.req')::uuid
    group by recipient_id having count(*) > 1
  ) d;
  if v_n <> 0 then raise exception 'FAIL T53: pedido de email duplicado'; end if;

  if exists (
    select 1 from public.email_outbox o
    where o.publication_id = v_pub and o.kind = 'comment_digest'
      and exists (select 1 from public.email_outbox_items i join public.publication_comments c on c.id = i.comment_id
                  where i.outbox_id = o.id and c.author_id = o.recipient_id)
  ) then
    raise exception 'FAIL T54: un autor quedó como destinatario de su propio comentario';
  end if;
end $$;

-- ------------------------------------------------------------
-- SUPER ADMIN QA: puede comentar; mencionable solo si está asignado a QA Sandbox
-- ------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', current_setting('v16.qa_sa'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  perform public.add_publication_comment(current_setting('v16.pub')::uuid, 'Comentario SA', '{}', gen_random_uuid());
end $$;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('v16.qa_am'), 'role', 'authenticated')::text, true);
set local role authenticated;
select set_config(
  'v16.sa_listed',
  (exists (select 1 from public.list_mentionable_members(current_setting('v16.client')::uuid)
           where user_id = current_setting('v16.qa_sa')::uuid))::text,
  true
);
reset role;

do $$
declare
  v_listed boolean := current_setting('v16.sa_listed')::boolean;
  v_assigned boolean;
begin
  select exists (select 1 from public.user_client_assignments
                 where user_id = current_setting('v16.qa_sa')::uuid and client_id = current_setting('v16.client')::uuid) into v_assigned;
  if v_listed <> v_assigned then
    raise exception 'FAIL T60: mencionabilidad del Super Admin (%) no coincide con su asignación (%)', v_listed, v_assigned;
  end if;
  raise notice 'v1.6 security checks: OK';
end $$;

rollback;
