-- Pruebas de 20261126000004_notification_rules.sql (reglas de notificaciones internas).
--
-- Requiere la migración aplicada y v16_notifications activo para QA Sandbox. Rol postgres. Se corre con el guard:
--   node supabase/qa/v1.6/qa-db.mjs security-checks --suite notification-rules --confirm wxkbkdoaohywqabmyqjk
-- NO DEJA RASTRO: todo termina en ROLLBACK, incluidos los usuarios temporales (segundo Client User, Client User
-- desactivado, segundo Account Manager, Account Manager de otro cliente) y la asignación temporal del Super Admin QA.
-- Una aserción fallida aborta con 'FAIL ..'. Cada paso usa su propio "guardado" (header x-planner-save-id).

begin;

create temp table nr_users (name text primary key, id uuid not null) on commit drop;
create temp table nr_pubs (name text primary key, id uuid not null) on commit drop;

-- ------------------------------------------------------------
-- Helpers (postgres)
-- ------------------------------------------------------------
create function pg_temp.uid(p_name text) returns uuid language sql as $$
  select id from nr_users where name = p_name
$$;
create function pg_temp.pid(p_name text) returns uuid language sql as $$
  select id from nr_pubs where name = p_name
$$;

-- Actúa como p_name en un guardado nuevo (claims + header). Después: set local role authenticated.
create function pg_temp.as_user(p_name text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(p_name), 'role', 'authenticated')::text, true);
  perform set_config('request.headers', json_build_object('x-planner-save-id', gen_random_uuid())::text, true);
end $$;

-- Mismo guardado que el paso anterior (no cambia el header).
create function pg_temp.same_save_as(p_name text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(p_name), 'role', 'authenticated')::text, true);
end $$;

create function pg_temp.clear(p_pub text) returns void language sql as $$
  delete from public.notifications where publication_id = pg_temp.pid(p_pub);
$$;

-- Avisos EXACTOS de la publicación: {"nombre": "tipo"}; además, una sola fila por destinatario.
create function pg_temp.expect(p_code text, p_pub text, p_expected jsonb) returns void language plpgsql as $$
declare
  v_actual jsonb;
  v_dupes int;
begin
  select coalesce(jsonb_object_agg(coalesce(u.name, n.recipient_id::text), n.type), '{}'::jsonb)
    into v_actual
  from public.notifications n left join nr_users u on u.id = n.recipient_id
  where n.publication_id = pg_temp.pid(p_pub);
  select count(*) - count(distinct recipient_id) into v_dupes from public.notifications where publication_id = pg_temp.pid(p_pub);
  if v_actual is distinct from p_expected or v_dupes <> 0 then
    raise exception 'FAIL %: esperado % / obtenido % (duplicados %)', p_code, p_expected, v_actual, v_dupes;
  end if;
end $$;

create function pg_temp.status_key(p_pub text) returns text language sql as $$
  select s.key from public.publications p join public.statuses s on s.id = p.status_id where p.id = pg_temp.pid(p_pub);
$$;

create function pg_temp.new_user(p_name text, p_role text, p_client uuid, p_banned boolean) returns uuid language plpgsql as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, banned_until, raw_app_meta_data, raw_user_meta_data)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'nr-' || p_name || '-' || left(v_id::text, 8) || '@perhaps-planner-qa.com', now(),
          case when p_banned then now() + interval '10 years' end, '{}'::jsonb, '{}'::jsonb);
  update public.profiles set role = p_role, client_id = p_client, full_name = 'NR ' || p_name where id = v_id;
  insert into nr_users values (p_name, v_id);
  perform set_config('nr.u.' || p_name, v_id::text, true);
  return v_id;
end $$;

-- ------------------------------------------------------------
-- Contexto
-- ------------------------------------------------------------
do $$
declare
  v_client uuid; v_other uuid; v_calendar uuid; v_ct uuid; v_account uuid; v_account2 uuid; v_am2 uuid; v_amx uuid;
  v_draft uuid; v_review uuid; v_approved uuid; v_name text; v_pub uuid;
begin
  select id into v_client from public.clients where slug = 'qa-sandbox';
  select id into v_other from public.clients where slug <> 'qa-sandbox' order by slug limit 1;
  select id into v_calendar from public.calendars where client_id = v_client and name = 'QA General';
  select id into v_ct from public.content_types order by sort_order limit 1;
  select id into v_account from public.client_accounts where client_id = v_client order by sort_order, handle limit 1;
  select id into v_account2 from public.client_accounts where client_id = v_client and id <> v_account order by sort_order, handle limit 1;
  select id into v_draft from public.statuses where key = 'draft';
  select id into v_review from public.statuses where key = 'in_review';
  select id into v_approved from public.statuses where key = 'approved';
  if v_client is null or v_other is null or v_calendar is null or v_account2 is null then
    raise exception 'SETUP: falta el entorno QA persistente (ver CLAUDE.md)';
  end if;
  if public.notifications_enabled_for(v_client) is not true then
    raise exception 'SETUP: v16_notifications no está activo para QA Sandbox';
  end if;

  insert into nr_users select 'cu', id from public.profiles where email = 'qa-client-user@perhaps-planner-qa.com';
  insert into nr_users select 'am', id from public.profiles where email = 'qa-account-manager@perhaps-planner-qa.com';
  insert into nr_users select 'sa', id from public.profiles where email = 'qa-super-admin@perhaps-planner-qa.com';
  insert into nr_users select 'ocu', id from public.profiles where role = 'client' and client_id = v_other order by id limit 1;
  perform set_config('nr.u.' || name, id::text, true) from nr_users;
  if (select count(*) from nr_users) <> 4 then
    raise exception 'SETUP: faltan usuarios QA persistentes';
  end if;
  perform pg_temp.new_user('cu2', 'client', v_client, false);
  perform pg_temp.new_user('cuoff', 'client', v_client, true);
  v_am2 := pg_temp.new_user('am2', 'account_manager', null, false);
  v_amx := pg_temp.new_user('amx', 'account_manager', null, false);
  insert into public.user_client_assignments (user_id, client_id) values (v_am2, v_client), (v_amx, v_other);
  -- El Super Admin QA, asignado a QA Sandbox solo durante la prueba.
  insert into public.user_client_assignments (user_id, client_id) values (current_setting('nr.u.sa')::uuid, v_client)
  on conflict do nothing;
  -- El Client User QA es Editor durante la prueba; cu2 sigue Lector (mismos avisos).
  insert into public.client_publication_editors (client_id, user_id, granted_by) values (v_client, current_setting('nr.u.cu')::uuid, current_setting('nr.u.sa')::uuid);

  for v_name in select unnest(array['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']) loop
    insert into public.publications (calendar_id, client_id, title, publication_date, publication_time, content_type_id, status_id, copy)
    values (v_calendar, v_client, 'QA NR ' || v_name || ' (temporal)', date '2026-12-01', time '10:00', v_ct, v_draft, 'texto')
    returning id into v_pub;
    insert into nr_pubs values (v_name, v_pub);
  end loop;
  insert into public.publication_destinations (publication_id, client_account_id) select id, v_account from nr_pubs;
  perform set_config('nr.p.' || name, id::text, true) from nr_pubs;

  perform set_config('nr.client', v_client::text, true);
  perform set_config('nr.calendar', v_calendar::text, true);
  perform set_config('nr.ct', v_ct::text, true);
  perform set_config('nr.account2', v_account2::text, true);
  perform set_config('nr.draft', v_draft::text, true);
  perform set_config('nr.review', v_review::text, true);
  perform set_config('nr.approved', v_approved::text, true);
end $$;

-- Lo creado como postgres (sin usuario) no notifica.
select pg_temp.expect('N00', 'p1', '{}');

-- ------------------------------------------------------------
-- 1) REVISIÓN Y APROBACIÓN
-- ------------------------------------------------------------
-- N01 Staff a En revisión -> todos los usuarios cliente activos (no el desactivado, no otro cliente, no el equipo).
select pg_temp.as_user('am');
set local role authenticated;
update public.publications set status_id = current_setting('nr.review')::uuid where id = current_setting('nr.p.p1')::uuid;
reset role;
select pg_temp.expect('N01', 'p1', '{"cu": "review_requested", "cu2": "review_requested"}');

-- N02 Cliente Editor a En revisión -> todo el equipo asignado (AM, AM2, SA asignado), no otros clientes ni amx.
select pg_temp.as_user('cu');
set local role authenticated;
update public.publications set status_id = current_setting('nr.review')::uuid where id = current_setting('nr.p.p2')::uuid;
reset role;
select pg_temp.expect('N02', 'p2', '{"am": "review_requested", "am2": "review_requested", "sa": "review_requested"}');

-- N03 Cliente aprobando por UPDATE/INSERT directo: rechazado (sin validación de versión).
select pg_temp.as_user('cu');
set local role authenticated;
do $$
begin
  begin
    update public.publications set status_id = current_setting('nr.approved')::uuid where id = current_setting('nr.p.p2')::uuid;
    raise exception 'FAIL N03: el cliente aprobó con un UPDATE directo';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    insert into public.publications (calendar_id, title, publication_date, content_type_id, status_id)
    values (current_setting('nr.calendar')::uuid, 'nace aprobada', current_date, current_setting('nr.ct')::uuid,
            current_setting('nr.approved')::uuid);
    raise exception 'FAIL N03b: el cliente creó una publicación Aprobada';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  -- Versión vieja: rechazada.
  begin
    perform public.approve_publication_as_client(current_setting('nr.p.p2')::uuid, now() - interval '1 day');
    raise exception 'FAIL N03c: aprobó una versión anterior';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' or sqlerrm not like '%cambió después%' then raise; end if;
  end;
end $$;
reset role;
select pg_temp.clear('p2');

-- N04 Cliente aprueba con la versión vigente -> equipo asignado.
select pg_temp.as_user('cu');
set local role authenticated;
select public.approve_publication_as_client(current_setting('nr.p.p2')::uuid, (select updated_at from public.publications where id = current_setting('nr.p.p2')::uuid));
reset role;
select pg_temp.expect('N04', 'p2', '{"am": "approved_by_client", "am2": "approved_by_client", "sa": "approved_by_client"}');
do $$
begin
  if pg_temp.status_key('p2') <> 'approved' then raise exception 'FAIL N04b: no quedó Aprobada'; end if;
end $$;

-- N05 Staff aprueba -> usuarios cliente.
select pg_temp.clear('p1');
select pg_temp.as_user('am');
set local role authenticated;
update public.publications set status_id = current_setting('nr.approved')::uuid where id = current_setting('nr.p.p1')::uuid;
reset role;
select pg_temp.expect('N05', 'p1', '{"cu": "approved_by_agency", "cu2": "approved_by_agency"}');

-- ------------------------------------------------------------
-- 6) APROBACIÓN INVALIDADA / 4) REPROGRAMACIÓN
-- ------------------------------------------------------------
-- N06 Solo fecha/hora sobre Aprobada: conserva la aprobación; aviso de reprogramación a clientes y resto del equipo.
select pg_temp.clear('p1');
select pg_temp.as_user('am');
set local role authenticated;
update public.publications set publication_date = date '2026-11-30', publication_time = time '18:00' where id = current_setting('nr.p.p1')::uuid;
reset role;
select pg_temp.expect('N06', 'p1', '{"cu": "rescheduled", "cu2": "rescheduled", "am2": "rescheduled", "sa": "rescheduled"}');
do $$
begin
  if pg_temp.status_key('p1') <> 'approved' then raise exception 'FAIL N06b: un cambio de fecha invalidó la aprobación'; end if;
  if (select details -> 'schedule' from public.notifications where publication_id = current_setting('nr.p.p1')::uuid and recipient_id = current_setting('nr.u.cu')::uuid)
     is distinct from '{"date": "2026-11-30", "time": "18:00"}'::jsonb then
    raise exception 'FAIL N06c: detalle de reprogramación incorrecto';
  end if;
end $$;

-- N07 Guardado sin cambios reales: ni aviso ni invalidación.
select pg_temp.clear('p1');
select pg_temp.as_user('am');
set local role authenticated;
update public.publications p set title = p.title, copy = p.copy, status_id = p.status_id where id = current_setting('nr.p.p1')::uuid;
reset role;
select pg_temp.expect('N07', 'p1', '{}');
do $$
begin
  if pg_temp.status_key('p1') <> 'approved' then raise exception 'FAIL N07b: un guardado sin cambios invalidó'; end if;
end $$;

-- N08 Contenido aprobado (copy) modificado por el Editor: vuelve a En revisión en la MISMA operación; aviso único a
-- usuarios cliente y equipo, aunque el Editor haya pedido "Aprobada".
select pg_temp.as_user('cu');
set local role authenticated;
update public.publications set copy = 'texto nuevo', status_id = current_setting('nr.approved')::uuid where id = current_setting('nr.p.p1')::uuid;
reset role;
select pg_temp.expect('N08', 'p1', '{"cu2": "approval_invalidated", "am": "approval_invalidated", "am2": "approval_invalidated", "sa": "approval_invalidated"}');
do $$
begin
  if pg_temp.status_key('p1') <> 'in_review' then raise exception 'FAIL N08b: no volvió a En revisión'; end if;
  if (select details ->> 'reason' from public.notifications where publication_id = current_setting('nr.p.p1')::uuid limit 1) <> 'content' then
    raise exception 'FAIL N08c: motivo de invalidación incorrecto';
  end if;
  if (select count(*) from public.publication_activity where publication_id = current_setting('nr.p.p1')::uuid and actor_id = current_setting('nr.u.cu')::uuid) <> 1 then
    raise exception 'FAIL N08d: la actividad del guardado no es un único evento';
  end if;
end $$;

-- N09 Un guardado = varias requests: fecha (publicación) y después destinos (mismo header) sobre una Aprobada ->
-- UN aviso por destinatario: invalidación con la fecha nueva.
select pg_temp.clear('p3');
select pg_temp.as_user('am');
set local role authenticated;
update public.publications set status_id = current_setting('nr.approved')::uuid where id = current_setting('nr.p.p3')::uuid;
reset role;
select pg_temp.clear('p3');
select pg_temp.as_user('am');
set local role authenticated;
update public.publications set publication_date = date '2026-12-05' where id = current_setting('nr.p.p3')::uuid;
reset role;
select pg_temp.same_save_as('am');
set local role authenticated;
insert into public.publication_destinations (publication_id, client_account_id) values (current_setting('nr.p.p3')::uuid, current_setting('nr.account2')::uuid);
reset role;
select pg_temp.expect('N09', 'p3', '{"cu": "approval_invalidated", "cu2": "approval_invalidated", "am2": "approval_invalidated", "sa": "approval_invalidated"}');
do $$
begin
  if pg_temp.status_key('p3') <> 'in_review' then raise exception 'FAIL N09b: cambiar destinos no invalidó'; end if;
  if exists (
    select 1 from public.notifications where publication_id = current_setting('nr.p.p3')::uuid
      and (details -> 'schedule' ->> 'date' is distinct from '2026-12-05' or details ->> 'reason' is distinct from 'content')
  ) then
    raise exception 'FAIL N09c: el aviso agrupado no incluye fecha nueva y motivo';
  end if;
end $$;

-- N10 Aprobada -> Borrador manual: invalidación (motivo estado) a clientes y equipo.
select pg_temp.clear('p2');
select pg_temp.as_user('am');
set local role authenticated;
update public.publications set status_id = current_setting('nr.draft')::uuid where id = current_setting('nr.p.p2')::uuid;
reset role;
select pg_temp.expect('N10', 'p2', '{"cu": "approval_invalidated", "cu2": "approval_invalidated", "am2": "approval_invalidated", "sa": "approval_invalidated"}');
do $$
begin
  if (select details from public.notifications where publication_id = current_setting('nr.p.p2')::uuid limit 1) <> '{"reason": "status", "status": "draft"}'::jsonb then
    raise exception 'FAIL N10b: detalle incorrecto';
  end if;
end $$;

-- N11 Archivo agregado en una publicación En revisión: nueva versión (fila actualizada), sin aviso.
select pg_temp.clear('p1');
do $$
declare
  v_before tid;
begin
  select ctid into v_before from public.publications where id = current_setting('nr.p.p1')::uuid;
  perform set_config('nr.ctid', v_before::text, true);
end $$;
select pg_temp.as_user('am');
set local role authenticated;
insert into public.publication_assets (publication_id, type, filename, thumbnail_url)
values (current_setting('nr.p.p1')::uuid, 'image', 'nr.webp', current_setting('nr.client') || '/' || current_setting('nr.p.p1')::uuid || '/nr.webp');
reset role;
select pg_temp.expect('N11', 'p1', '{}');
do $$
begin
  if (select ctid::text from public.publications where id = current_setting('nr.p.p1')::uuid) = current_setting('nr.ctid') then
    raise exception 'FAIL N11b: un archivo nuevo no actualizó la versión de la publicación';
  end if;
end $$;

-- ------------------------------------------------------------
-- 3) PUBLICADA / DESCARTADA
-- ------------------------------------------------------------
select pg_temp.clear('p4');
select pg_temp.as_user('am');
set local role authenticated;
update public.publications set status_id = (select id from public.statuses where key = 'published') where id = current_setting('nr.p.p4')::uuid;
reset role;
select pg_temp.expect('N12', 'p4', '{"cu": "published", "cu2": "published"}');
select pg_temp.clear('p4');
select pg_temp.as_user('cu');
set local role authenticated;
update public.publications set status_id = (select id from public.statuses where key = 'discarded') where id = current_setting('nr.p.p4')::uuid;
reset role;
select pg_temp.expect('N13', 'p4', '{"cu2": "discarded"}');

-- ------------------------------------------------------------
-- 5) CREACIÓN POR CLIENTE EDITOR
-- ------------------------------------------------------------
select pg_temp.as_user('cu');
set local role authenticated;
do $$
declare
  v_id uuid;
begin
  insert into public.publications (calendar_id, title, publication_date, content_type_id, status_id)
  values (current_setting('nr.calendar')::uuid, 'QA NR editor borrador', current_date, current_setting('nr.ct')::uuid, current_setting('nr.draft')::uuid)
  returning id into v_id;
  perform set_config('nr.c1', v_id::text, true);
end $$;
reset role;
insert into nr_pubs values ('c1', current_setting('nr.c1')::uuid);
select set_config('nr.p.c1', current_setting('nr.c1'), true);
select pg_temp.expect('N14', 'c1', '{"am": "created_by_client", "am2": "created_by_client", "sa": "created_by_client"}');

select pg_temp.as_user('cu');
set local role authenticated;
do $$
declare
  v_id uuid;
begin
  insert into public.publications (calendar_id, title, publication_date, content_type_id, status_id)
  values (current_setting('nr.calendar')::uuid, 'QA NR editor revisión', current_date, current_setting('nr.ct')::uuid, current_setting('nr.review')::uuid)
  returning id into v_id;
  perform set_config('nr.c2', v_id::text, true);
  insert into public.publications (calendar_id, title, publication_date, content_type_id, status_id)
  values (current_setting('nr.calendar')::uuid, 'QA NR editor publicada', current_date, current_setting('nr.ct')::uuid,
          (select id from public.statuses where key = 'published'))
  returning id into v_id;
  perform set_config('nr.c3', v_id::text, true);
end $$;
reset role;
insert into nr_pubs values ('c2', current_setting('nr.c2')::uuid), ('c3', current_setting('nr.c3')::uuid);
-- Nace En revisión: SOLO el aviso de revisión.
select pg_temp.expect('N15', 'c2', '{"am": "review_requested", "am2": "review_requested", "sa": "review_requested"}');
-- Nace Publicada: el equipo recibe la creación; los otros usuarios cliente, Publicada.
select pg_temp.expect('N16', 'c3', '{"am": "created_by_client", "am2": "created_by_client", "sa": "created_by_client", "cu2": "published"}');

-- Staff crea: la programación inicial no es reprogramación y Borrador no avisa.
select pg_temp.as_user('am');
set local role authenticated;
do $$
declare
  v_id uuid;
begin
  insert into public.publications (calendar_id, title, publication_date, publication_time, content_type_id, status_id)
  values (current_setting('nr.calendar')::uuid, 'QA NR staff', current_date, time '09:00', current_setting('nr.ct')::uuid, current_setting('nr.draft')::uuid)
  returning id into v_id;
  perform set_config('nr.c4', v_id::text, true);
end $$;
reset role;
insert into nr_pubs values ('c4', current_setting('nr.c4')::uuid);
select pg_temp.expect('N17', 'c4', '{}');

-- ------------------------------------------------------------
-- 2) COMENTARIOS, RESPUESTAS, MENCIONES, REACCIONES
-- ------------------------------------------------------------
-- N18 Comentario del cliente (sin participantes previos) -> equipo asignado.
select pg_temp.as_user('cu2');
set local role authenticated;
select set_config('nr.k1', (public.add_publication_comment(current_setting('nr.p.p5')::uuid, 'comentario cliente')).id::text, true);
reset role;
select pg_temp.expect('N18', 'p5', '{"am": "comment", "am2": "comment", "sa": "comment"}');

-- N19 Comentario del staff -> usuarios cliente + participantes previos autorizados (cu2 ya comentó).
select pg_temp.clear('p5');
select pg_temp.as_user('am2');
set local role authenticated;
select set_config('nr.k2', (public.add_publication_comment(current_setting('nr.p.p5')::uuid, 'comentario staff')).id::text, true);
reset role;
select pg_temp.expect('N19', 'p5', '{"cu": "comment", "cu2": "comment"}');

-- N20 Respuesta con mención: autor original (am2) = reply; mencionado (am) = mention; el resto = comment. Nunca dos.
select pg_temp.clear('p5');
select pg_temp.as_user('cu');
set local role authenticated;
select public.add_publication_comment(
  current_setting('nr.p.p5')::uuid, 'respuesta @am', array[current_setting('nr.u.am')::uuid, current_setting('nr.u.amx')::uuid, current_setting('nr.u.cuoff')::uuid],
  null, current_setting('nr.k2')::uuid
);
reset role;
select pg_temp.expect('N20', 'p5', '{"am2": "reply", "am": "mention", "sa": "comment", "cu2": "comment"}');

-- N21 Mención + respuesta al MISMO destinatario: gana la mención (cu2 es autor de k1 y además mencionado).
select pg_temp.clear('p5');
select pg_temp.as_user('am');
set local role authenticated;
select public.add_publication_comment(current_setting('nr.p.p5')::uuid, 'a @cu2', array[current_setting('nr.u.cu2')::uuid], null, current_setting('nr.k1')::uuid);
reset role;
select pg_temp.expect('N21', 'p5', '{"cu2": "mention", "cu": "comment", "am2": "comment"}');

-- N22 Editar un comentario: solo menciones nuevas.
select pg_temp.clear('p5');
select pg_temp.as_user('am2');
set local role authenticated;
select public.edit_publication_comment(current_setting('nr.k2')::uuid, 'comentario staff editado @sa', array[current_setting('nr.u.sa')::uuid]);
reset role;
select pg_temp.expect('N22', 'p5', '{"sa": "mention"}');

-- N23 Reacciones: sin avisos.
select pg_temp.clear('p5');
select pg_temp.as_user('cu');
set local role authenticated;
select public.set_comment_reaction(current_setting('nr.k2')::uuid, '👍', true);
reset role;
select pg_temp.expect('N23', 'p5', '{}');

-- N24 Pérdida de acceso: am2 sin asignación ya no recibe (ni por participante).
delete from public.user_client_assignments where user_id = current_setting('nr.u.am2')::uuid and client_id = current_setting('nr.client')::uuid;
select pg_temp.as_user('cu2');
set local role authenticated;
select public.add_publication_comment(current_setting('nr.p.p5')::uuid, 'después de quitar a am2');
reset role;
select pg_temp.expect('N24', 'p5', '{"am": "comment", "sa": "comment", "cu": "comment"}');
insert into public.user_client_assignments (user_id, client_id) values (current_setting('nr.u.am2')::uuid, current_setting('nr.client')::uuid);

-- ------------------------------------------------------------
-- 8) ARCHIVADAS + 7) LEÍDAS
-- ------------------------------------------------------------
-- N25 Archivar: pendientes suprimidos SIN marcarse leídos; restaurar no los reactiva.
select pg_temp.clear('p6');
select pg_temp.as_user('am');
set local role authenticated;
update public.publications set status_id = current_setting('nr.review')::uuid where id = current_setting('nr.p.p6')::uuid;
update public.publications set archived_at = now(), archived_by = auth.uid() where id = current_setting('nr.p.p6')::uuid;
update public.publications set archived_at = null, archived_by = null where id = current_setting('nr.p.p6')::uuid;
reset role;
do $$
begin
  if exists (select 1 from public.notifications where publication_id = current_setting('nr.p.p6')::uuid and (suppressed_at is null or read_at is not null)) then
    raise exception 'FAIL N25: archivar no suprimió (o marcó leídos) los avisos pendientes';
  end if;
  if (select count(*) from public.notifications where publication_id = current_setting('nr.p.p6')::uuid) <> 2 then
    raise exception 'FAIL N25b: se perdieron avisos del historial';
  end if;
end $$;

-- N26 Marcar por publicación con tope: no marca avisos posteriores a lo visto.
select pg_temp.clear('p7');
insert into public.notifications (recipient_id, client_id, publication_id, type, event_key, created_at)
values
  (current_setting('nr.u.cu')::uuid, current_setting('nr.client')::uuid, current_setting('nr.p.p7')::uuid, 'comment', 'nr:old', now() - interval '2 minutes'),
  (current_setting('nr.u.cu')::uuid, current_setting('nr.client')::uuid, current_setting('nr.p.p7')::uuid, 'reply', 'nr:new', now() + interval '2 minutes'),
  (current_setting('nr.u.cu')::uuid, current_setting('nr.client')::uuid, current_setting('nr.p.p7')::uuid, 'rescheduled', 'nr:status', now() - interval '2 minutes');
select pg_temp.as_user('cu');
set local role authenticated;
select public.mark_publication_notifications_read(current_setting('nr.p.p7')::uuid, array['comment', 'mention', 'reply'], now());
do $$
begin
  -- Pendientes visibles para el propio usuario: el reply posterior y el de estado.
  if (select count(*) from public.notifications where publication_id = current_setting('nr.p.p7')::uuid and read_at is null and suppressed_at is null) <> 2 then
    raise exception 'FAIL N26: el tope o el filtro de tipos no se respetó';
  end if;
  -- Nadie crea, edita ni borra avisos directamente.
  begin
    insert into public.notifications (recipient_id, client_id, publication_id, type, event_key)
    values (auth.uid(), current_setting('nr.client')::uuid, current_setting('nr.p.p7')::uuid, 'comment', 'nr:forged');
    raise exception 'FAIL N27: un usuario creó una notificación';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$
begin
  raise notice 'notification-rules: OK (N00-N27)';
end $$;
rollback;
