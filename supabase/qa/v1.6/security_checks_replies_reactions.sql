-- v1.6 — Pruebas de 20261014000001_v16_comment_replies.sql y 20261014000002_v16_comment_reactions.sql.
--
-- NO EJECUTAR sin autorización. Requiere ambas migraciones aplicadas (o el dry-run del guard, que las aplica dentro de
-- la misma transacción). Rol postgres.
-- NO DEJA RASTRO: todo termina en ROLLBACK (publicaciones, comentarios, reacciones y notificaciones temporales). Una
-- aserción fallida aborta con 'FAIL RP../RX..'. Si todo pasa, el último NOTICE es "v1.6 replies/reactions checks: OK".
-- Solo usa los usuarios QA persistentes de CLAUDE.md.

begin;

-- ------------------------------------------------------------
-- Contexto (como postgres)
-- ------------------------------------------------------------
do $$
declare
  v_client uuid; v_calendar uuid; v_ct uuid; v_cu uuid; v_am uuid;
  v_foreign_pub uuid; v_foreign_client uuid;
  v_rev uuid; v_rev2 uuid; v_draft uuid; v_appr uuid;
  v_c_rev uuid; v_c_del uuid; v_c_rev2 uuid; v_c_draft uuid; v_c_appr uuid; v_c_foreign uuid;
begin
  select id into v_client from public.clients where slug = 'qa-sandbox';
  select id into v_calendar from public.calendars where client_id = v_client and name = 'QA General';
  select id into v_ct from public.content_types order by sort_order limit 1;
  select id into v_cu from public.profiles where email = 'qa-client-user@perhaps-planner-qa.com';
  select id into v_am from public.profiles where email = 'qa-account-manager@perhaps-planner-qa.com';
  select id, client_id into v_foreign_pub, v_foreign_client from public.publications where client_id <> v_client limit 1;
  if v_client is null or v_calendar is null or v_cu is null or v_am is null then
    raise exception 'SETUP: falta el entorno QA persistente (ver CLAUDE.md)';
  end if;
  if v_foreign_pub is null then
    raise exception 'SETUP: no hay ninguna publicación de otro cliente para las pruebas negativas';
  end if;

  insert into public.publications (calendar_id, client_id, title, publication_date, content_type_id, status_id)
  values (v_calendar, v_client, 'QA v1.6 RX revisión (temporal)', current_date, v_ct, (select id from public.statuses where key = 'in_review'))
  returning id into v_rev;
  insert into public.publications (calendar_id, client_id, title, publication_date, content_type_id, status_id)
  values (v_calendar, v_client, 'QA v1.6 RX revisión 2 (temporal)', current_date, v_ct, (select id from public.statuses where key = 'in_review'))
  returning id into v_rev2;
  insert into public.publications (calendar_id, client_id, title, publication_date, content_type_id, status_id)
  values (v_calendar, v_client, 'QA v1.6 RX borrador (temporal)', current_date, v_ct, (select id from public.statuses where key = 'draft'))
  returning id into v_draft;
  insert into public.publications (calendar_id, client_id, title, publication_date, content_type_id, status_id)
  values (v_calendar, v_client, 'QA v1.6 RX aprobada (temporal)', current_date, v_ct, (select id from public.statuses where key = 'approved'))
  returning id into v_appr;

  insert into public.publication_comments (publication_id, client_id, author_id, author_name, author_role, body, request_id)
  values (v_rev, v_client, v_am, 'QA AM', 'account_manager', 'original', gen_random_uuid()) returning id into v_c_rev;
  insert into public.publication_comments (publication_id, client_id, author_id, author_name, author_role, body, request_id, deleted_at)
  values (v_rev, v_client, v_am, 'QA AM', 'account_manager', '', gen_random_uuid(), now()) returning id into v_c_del;
  insert into public.publication_comments (publication_id, client_id, author_id, author_name, author_role, body, request_id)
  values (v_rev2, v_client, v_am, 'QA AM', 'account_manager', 'otra publicación', gen_random_uuid()) returning id into v_c_rev2;
  insert into public.publication_comments (publication_id, client_id, author_id, author_name, author_role, body, request_id)
  values (v_draft, v_client, v_am, 'QA AM', 'account_manager', 'en borrador', gen_random_uuid()) returning id into v_c_draft;
  insert into public.publication_comments (publication_id, client_id, author_id, author_name, author_role, body, request_id)
  values (v_appr, v_client, v_am, 'QA AM', 'account_manager', 'en aprobada', gen_random_uuid()) returning id into v_c_appr;
  insert into public.publication_comments (publication_id, client_id, author_id, author_name, author_role, body, request_id)
  values (v_foreign_pub, v_foreign_client, v_am, 'QA AM', 'account_manager', 'ajeno', gen_random_uuid()) returning id into v_c_foreign;

  -- Reacción de otro cliente (como postgres): el Client User QA no debe verla (RX13).
  insert into public.publication_comment_reactions (comment_id, user_id, emoji) values (v_c_foreign, v_am, '👀');

  perform set_config('rx.cu', v_cu::text, true);
  perform set_config('rx.am', v_am::text, true);
  perform set_config('rx.client', v_client::text, true);
  perform set_config('rx.rev', v_rev::text, true);
  perform set_config('rx.rev2', v_rev2::text, true);
  perform set_config('rx.c_rev', v_c_rev::text, true);
  perform set_config('rx.c_del', v_c_del::text, true);
  perform set_config('rx.c_rev2', v_c_rev2::text, true);
  perform set_config('rx.c_draft', v_c_draft::text, true);
  perform set_config('rx.c_appr', v_c_appr::text, true);
  perform set_config('rx.c_foreign', v_c_foreign::text, true);
  perform set_config('rx.notif_before', (select count(*) from public.notifications)::text, true);
  perform set_config('rx.reads_before', (select count(*) from public.publication_comment_reads)::text, true);
  perform set_config('rx.status_rev', (select status_id::text from public.publications where id = v_rev), true);
end $$;

-- ------------------------------------------------------------
-- REACCIONES — CLIENT USER QA
-- ------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', current_setting('rx.cu'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_c uuid := current_setting('rx.c_rev')::uuid;
begin
  -- RX01: agregar; repetir es idempotente; el mismo emoji no se duplica.
  if public.set_comment_reaction(v_c, '👍', true) is not true or public.set_comment_reaction(v_c, '👍', true) is not true then
    raise exception 'FAIL RX01: no quedó activa la reacción';
  end if;
  if (select count(*) from public.publication_comment_reactions where comment_id = v_c and user_id = auth.uid() and emoji = '👍') <> 1 then
    raise exception 'FAIL RX01b: el mismo emoji quedó duplicado';
  end if;
  -- RX02: otro emoji distinto del mismo usuario.
  perform public.set_comment_reaction(v_c, '❤️', true);
  if (select count(*) from public.publication_comment_reactions where comment_id = v_c and user_id = auth.uid() and active) <> 2 then
    raise exception 'FAIL RX02: no se admiten dos emojis distintos del mismo usuario';
  end if;
  -- RX03: quitar. (Llamada y lectura en sentencias separadas: una sentencia no ve los cambios que hace una función
  -- llamada dentro de ella misma — su snapshot es el del inicio.)
  if public.set_comment_reaction(v_c, '👍', false) is not false then
    raise exception 'FAIL RX03: la RPC no devolvió la reacción como quitada';
  end if;
  if (select active from public.publication_comment_reactions where comment_id = v_c and user_id = auth.uid() and emoji = '👍') then
    raise exception 'FAIL RX03b: la reacción sigue activa';
  end if;
  -- RX04: emoji fuera de la lista.
  begin
    perform public.set_comment_reaction(v_c, '🔥', true);
    raise exception 'FAIL RX04: aceptó un emoji no aprobado';
  exception when invalid_parameter_value then null;
  end;
  -- RX05: comentario eliminado.
  begin
    perform public.set_comment_reaction(current_setting('rx.c_del')::uuid, '👍', true);
    raise exception 'FAIL RX05: reaccionó a un comentario eliminado';
  exception when raise_exception then null;
  end;
  -- RX06: publicación en Borrador.
  begin
    perform public.set_comment_reaction(current_setting('rx.c_draft')::uuid, '👍', true);
    raise exception 'FAIL RX06: reaccionó en Borrador';
  exception when raise_exception then null;
  end;
  -- RX07: Aprobada sí.
  if public.set_comment_reaction(current_setting('rx.c_appr')::uuid, '🎉', true) is not true then
    raise exception 'FAIL RX07: no se pudo reaccionar en Aprobada';
  end if;
  -- RX08: comentario de otro cliente → sin permisos.
  begin
    perform public.set_comment_reaction(current_setting('rx.c_foreign')::uuid, '👍', true);
    raise exception 'FAIL RX08: reaccionó a un comentario de otro cliente';
  exception when insufficient_privilege then null;
  end;
  -- RX09: sin escritura directa.
  begin
    insert into public.publication_comment_reactions (comment_id, user_id, emoji) values (v_c, auth.uid(), '👏');
    raise exception 'FAIL RX09a: insert directo permitido';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.publication_comment_reactions set active = true where comment_id = v_c;
    raise exception 'FAIL RX09b: update directo permitido';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.publication_comment_reactions where comment_id = v_c;
    raise exception 'FAIL RX09c: delete directo permitido';
  exception when insufficient_privilege then null;
  end;
  -- RX13: RLS — no ve reacciones de otro cliente.
  if exists (select 1 from public.publication_comment_reactions where comment_id = current_setting('rx.c_foreign')::uuid) then
    raise exception 'FAIL RX13: el Client User ve reacciones de otro cliente';
  end if;
end $$;
reset role;

-- ------------------------------------------------------------
-- REACCIONES — ACCOUNT MANAGER QA: solo toca las propias
-- ------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', current_setting('rx.am'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_c uuid := current_setting('rx.c_rev')::uuid;
begin
  -- RX11: quitar "❤️" como AM no afecta la del Client User (la RPC usa auth.uid()).
  perform public.set_comment_reaction(v_c, '❤️', false);
  if not exists (
    select 1 from public.publication_comment_reactions
    where comment_id = v_c and user_id = current_setting('rx.cu')::uuid and emoji = '❤️' and active
  ) then
    raise exception 'FAIL RX11: el AM alteró la reacción del Client User';
  end if;
end $$;
reset role;

-- ------------------------------------------------------------
-- REACCIONES — integridad y efectos laterales (como postgres)
-- ------------------------------------------------------------
do $$
begin
  -- RX10: publication_id / client_id derivados del comentario.
  if exists (
    select 1 from public.publication_comment_reactions r
    join public.publication_comments c on c.id = r.comment_id
    where r.publication_id <> c.publication_id or r.client_id <> c.client_id
  ) then
    raise exception 'FAIL RX10: alcance de una reacción distinto del de su comentario';
  end if;
  -- RX12: las reacciones no generan notificaciones, no tocan lecturas ni el estado de la publicación.
  if (select count(*) from public.notifications)::text <> current_setting('rx.notif_before')
     or (select count(*) from public.publication_comment_reads)::text <> current_setting('rx.reads_before')
     or (select status_id::text from public.publications where id = current_setting('rx.rev')::uuid) <> current_setting('rx.status_rev') then
    raise exception 'FAIL RX12: una reacción cambió notificaciones, lecturas o el estado de la publicación';
  end if;
  -- RX14: anon sin ejecución ni lectura; authenticated sin escritura directa.
  if has_function_privilege('anon', 'public.set_comment_reaction(uuid, text, boolean)', 'execute')
     or has_table_privilege('anon', 'public.publication_comment_reactions', 'select')
     or has_table_privilege('authenticated', 'public.publication_comment_reactions', 'insert')
     or has_function_privilege('authenticated', 'public.derive_comment_reaction_scope()', 'execute') then
    raise exception 'FAIL RX14: grants de más en reacciones';
  end if;
  -- RX15: la tabla está publicada en Realtime con RLS y replica identity DEFAULT.
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'publication_comment_reactions')
     or exists (select 1 from pg_class where relname = 'publication_comment_reactions' and (not relrowsecurity or relreplident <> 'd')) then
    raise exception 'FAIL RX15: Realtime/RLS/replica identity de reacciones';
  end if;
end $$;

-- ------------------------------------------------------------
-- RESPUESTAS — CLIENT USER QA
-- ------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', current_setting('rx.cu'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_rev uuid := current_setting('rx.rev')::uuid;
  v_row public.publication_comments%rowtype;
begin
  -- RP01: responder a un comentario de la misma publicación → referencia guardada.
  v_row := public.add_publication_comment(v_rev, 'respuesta', '{}', gen_random_uuid(), current_setting('rx.c_rev')::uuid);
  if v_row.reply_to_comment_id is distinct from current_setting('rx.c_rev')::uuid then
    raise exception 'FAIL RP01: no se guardó la referencia al original';
  end if;
  -- RP02: original de OTRA publicación → se ignora.
  v_row := public.add_publication_comment(v_rev, 'respuesta 2', '{}', gen_random_uuid(), current_setting('rx.c_rev2')::uuid);
  if v_row.reply_to_comment_id is not null then
    raise exception 'FAIL RP02: referenció un comentario de otra publicación';
  end if;
  -- RP03: original de OTRO cliente → se ignora.
  v_row := public.add_publication_comment(v_rev, 'respuesta 3', '{}', gen_random_uuid(), current_setting('rx.c_foreign')::uuid);
  if v_row.reply_to_comment_id is not null then
    raise exception 'FAIL RP03: referenció un comentario de otro cliente';
  end if;
  -- RP04: compatibilidad — 4 argumentos posicionales (llamadas existentes) siguen funcionando, sin referencia.
  v_row := public.add_publication_comment(v_rev, 'sin respuesta', '{}', gen_random_uuid());
  if v_row.id is null or v_row.reply_to_comment_id is not null then
    raise exception 'FAIL RP04: la firma anterior dejó de funcionar';
  end if;
  -- RP05: responder a un comentario eliminado (de la misma publicación) se admite: la UI muestra "eliminado".
  v_row := public.add_publication_comment(v_rev, 'a uno eliminado', '{}', gen_random_uuid(), current_setting('rx.c_del')::uuid);
  if v_row.reply_to_comment_id is distinct from current_setting('rx.c_del')::uuid then
    raise exception 'FAIL RP05: no se guardó la referencia a un original eliminado';
  end if;
end $$;
reset role;

-- ------------------------------------------------------------
-- RESPUESTAS — integridad fuera de la RPC (como postgres)
-- ------------------------------------------------------------
do $$
declare
  v_id uuid;
begin
  -- RP06: aun escribiendo directo, el original tiene que ser de la misma publicación.
  begin
    insert into public.publication_comments (publication_id, client_id, author_id, author_name, author_role, body, request_id, reply_to_comment_id)
    values (current_setting('rx.rev')::uuid, current_setting('rx.client')::uuid, current_setting('rx.am')::uuid, 'QA AM',
            'account_manager', 'cruzado', gen_random_uuid(), current_setting('rx.c_rev2')::uuid);
    raise exception 'FAIL RP06: se guardó una respuesta a otra publicación';
  exception when check_violation then null;
  end;
  -- RP07: un comentario no se responde a sí mismo.
  select id into v_id from public.publication_comments where id = current_setting('rx.c_rev')::uuid;
  begin
    update public.publication_comments set reply_to_comment_id = v_id where id = v_id;
    raise exception 'FAIL RP07: un comentario quedó respondiéndose a sí mismo';
  exception when check_violation then null;
  end;
  -- RP08: anon sin ejecución de la firma nueva; la firma vieja ya no existe.
  if has_function_privilege('anon', 'public.add_publication_comment(uuid, text, uuid[], uuid, uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.add_publication_comment(uuid, text, uuid[], uuid, uuid)', 'execute')
     or to_regprocedure('public.add_publication_comment(uuid, text, uuid[], uuid)') is not null then
    raise exception 'FAIL RP08: grants o firmas de add_publication_comment';
  end if;
  raise notice 'v1.6 replies/reactions checks: OK';
end $$;

rollback;
