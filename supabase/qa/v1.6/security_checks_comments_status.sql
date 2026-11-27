-- v1.6 — Pruebas de 20261126000001_v16_comments_before_published.sql (comentarios abiertos en todos los estados salvo
-- Publicada: Borrador, En revisión, Aprobada y Descartada).
--
-- NO EJECUTAR sin autorización. Requiere la migración aplicada. Rol postgres. Se corre con el guard:
--   node supabase/qa/v1.6/qa-db.mjs security-checks --suite comments-status --confirm wxkbkdoaohywqabmyqjk
-- NO DEJA RASTRO: todo termina en ROLLBACK. Una aserción fallida aborta con 'FAIL CS..'. Solo usa los usuarios QA
-- persistentes de CLAUDE.md.

begin;

-- ------------------------------------------------------------
-- Contexto (como postgres): una publicación por estado en QA Sandbox + un comentario propio del Client User en cada una.
-- ------------------------------------------------------------
do $$
declare
  v_client uuid; v_calendar uuid; v_ct uuid; v_cu uuid; v_am uuid; v_foreign_client uuid; v_foreign_calendar uuid;
  v_key text; v_pub uuid; v_c uuid;
begin
  select id into v_client from public.clients where slug = 'qa-sandbox';
  select id into v_calendar from public.calendars where client_id = v_client and name = 'QA General';
  select id into v_ct from public.content_types order by sort_order limit 1;
  select id into v_cu from public.profiles where email = 'qa-client-user@perhaps-planner-qa.com';
  select id into v_am from public.profiles where email = 'qa-account-manager@perhaps-planner-qa.com';
  select c.id, k.id into v_foreign_client, v_foreign_calendar
  from public.clients c join public.calendars k on k.client_id = c.id
  where c.id <> v_client limit 1;
  if v_client is null or v_calendar is null or v_cu is null or v_am is null or v_foreign_client is null then
    raise exception 'SETUP: falta el entorno QA persistente (ver CLAUDE.md)';
  end if;

  foreach v_key in array array['draft', 'in_review', 'approved', 'published', 'discarded'] loop
    insert into public.publications (calendar_id, client_id, title, publication_date, content_type_id, status_id)
    values (v_calendar, v_client, 'QA v1.6 CS ' || v_key || ' (temporal)', current_date, v_ct,
            (select id from public.statuses where key = v_key))
    returning id into v_pub;
    insert into public.publication_comments (publication_id, client_id, author_id, author_name, author_role, body, request_id)
    values (v_pub, v_client, v_cu, 'QA Client', 'client', 'propio ' || v_key, gen_random_uuid())
    returning id into v_c;
    perform set_config('cs.pub_' || v_key, v_pub::text, true);
    perform set_config('cs.c_' || v_key, v_c::text, true);
  end loop;

  insert into public.publications (calendar_id, client_id, title, publication_date, content_type_id, status_id)
  values (v_calendar, v_client, 'QA v1.6 CS published 2 (temporal)', current_date, v_ct,
          (select id from public.statuses where key = 'published'))
  returning id into v_pub;
  perform set_config('cs.pub_published2', v_pub::text, true);

  insert into public.publications (calendar_id, client_id, title, publication_date, content_type_id, status_id)
  values (v_foreign_calendar, v_foreign_client, 'QA v1.6 CS ajena (temporal)', current_date, v_ct,
          (select id from public.statuses where key = 'draft'))
  returning id into v_pub;
  perform set_config('cs.pub_foreign', v_pub::text, true);
  perform set_config('cs.cu', v_cu::text, true);
  perform set_config('cs.am', v_am::text, true);
end $$;

-- ------------------------------------------------------------
-- CLIENT USER QA (solo QA Sandbox)
-- ------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', current_setting('cs.cu'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_key text;
begin
  -- CS01: comentar y responder en Borrador, En revisión, Aprobada y Descartada.
  foreach v_key in array array['draft', 'in_review', 'approved', 'discarded'] loop
    begin
      perform public.add_publication_comment(current_setting('cs.pub_' || v_key)::uuid, 'nuevo ' || v_key, '{}', gen_random_uuid());
      perform public.add_publication_comment(current_setting('cs.pub_' || v_key)::uuid, 'respuesta ' || v_key, '{}',
                                             gen_random_uuid(), current_setting('cs.c_' || v_key)::uuid);
    exception when others then
      raise exception 'FAIL CS01: no se pudo comentar/responder en % (%)', v_key, sqlerrm;
    end;
  end loop;

  -- CS02: Publicada rechaza comentarios nuevos y respuestas.
  begin
    perform public.add_publication_comment(current_setting('cs.pub_published')::uuid, 'tarde', '{}', gen_random_uuid());
    raise exception 'FAIL CS02: comentario aceptado en Publicada';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform public.add_publication_comment(current_setting('cs.pub_published')::uuid, 'respuesta tarde', '{}',
                                           gen_random_uuid(), current_setting('cs.c_published')::uuid);
    raise exception 'FAIL CS02b: respuesta aceptada en Publicada';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;

  -- CS03: editar / eliminar propios: sí en Borrador, Aprobada y Descartada; no en Publicada.
  perform public.edit_publication_comment(current_setting('cs.c_draft')::uuid, 'editado en borrador', '{}');
  perform public.delete_publication_comment(current_setting('cs.c_approved')::uuid);
  perform public.edit_publication_comment(current_setting('cs.c_discarded')::uuid, 'editado en descartada', '{}');
  begin
    perform public.edit_publication_comment(current_setting('cs.c_published')::uuid, 'editado tarde', '{}');
    raise exception 'FAIL CS03: edición aceptada en Publicada';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    perform public.delete_publication_comment(current_setting('cs.c_published')::uuid);
    raise exception 'FAIL CS03b: eliminación aceptada en Publicada';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;

  -- CS04: reacciones en todos los estados (Borrador, Publicada y Descartada incluidas).
  if public.set_comment_reaction(current_setting('cs.c_draft')::uuid, '👍', true) is not true
     or public.set_comment_reaction(current_setting('cs.c_published')::uuid, '👍', true) is not true
     or public.set_comment_reaction(current_setting('cs.c_discarded')::uuid, '👍', true) is not true then
    raise exception 'FAIL CS04: no se pudo reaccionar en Borrador, Publicada o Descartada';
  end if;

  -- CS05: el acceso se sigue respetando (Borrador de otro cliente → sin permisos).
  begin
    perform public.add_publication_comment(current_setting('cs.pub_foreign')::uuid, 'ajeno', '{}', gen_random_uuid());
    raise exception 'FAIL CS05: comentó en un cliente ajeno';
  exception when insufficient_privilege then null;
  end;
end $$;

do $$
begin
  -- CS06: el historial de Publicada sigue visible (RLS de lectura sin estado).
  if not exists (select 1 from public.publication_comments where publication_id = current_setting('cs.pub_published')::uuid) then
    raise exception 'FAIL CS06: el historial de Publicada no es visible para el Client User';
  end if;
  if (select body from public.publication_comments where id = current_setting('cs.c_draft')::uuid) <> 'editado en borrador'
     or (select body from public.publication_comments where id = current_setting('cs.c_discarded')::uuid) <> 'editado en descartada'
     or (select deleted_at from public.publication_comments where id = current_setting('cs.c_approved')::uuid) is null then
    raise exception 'FAIL CS03c: la edición o eliminación permitida no se aplicó';
  end if;
end $$;

-- ------------------------------------------------------------
-- Vuelve a un estado anterior (como postgres): se habilitan de nuevo.
-- ------------------------------------------------------------
reset role;
-- Sin claims de usuario (como service_role): desde 20261126000004 un Client User no puede aprobar con un UPDATE.
select set_config('cs.saved_claims', current_setting('request.jwt.claims', true), true);
select set_config('request.jwt.claims', '', true);
update public.publications set status_id = (select id from public.statuses where key = 'approved')
where id = current_setting('cs.pub_published')::uuid;
select set_config('request.jwt.claims', current_setting('cs.saved_claims'), true);

set local role authenticated;
do $$
begin
  -- CS07: Publicada → Aprobada: comentar y editar vuelven a estar permitidos.
  begin
    perform public.add_publication_comment(current_setting('cs.pub_published')::uuid, 'de nuevo', '{}', gen_random_uuid());
    perform public.edit_publication_comment(current_setting('cs.c_published')::uuid, 'editado al volver', '{}');
  exception when others then
    raise exception 'FAIL CS07: no se habilitaron al volver a Aprobada (%)', sqlerrm;
  end;
end $$;

-- ------------------------------------------------------------
-- ACCOUNT MANAGER QA (asignado a QA Sandbox): misma regla para staff.
-- ------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('cs.am'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  -- CS08: staff comenta en Borrador y Descartada; en Publicada no (cs.pub_published volvió a Aprobada en CS07: se usa una
  -- Publicada nueva).
  perform public.add_publication_comment(current_setting('cs.pub_draft')::uuid, 'staff en borrador', '{}', gen_random_uuid());
  perform public.add_publication_comment(current_setting('cs.pub_discarded')::uuid, 'staff en descartada', '{}', gen_random_uuid());
  begin
    perform public.add_publication_comment(current_setting('cs.pub_published2')::uuid, 'staff tarde', '{}', gen_random_uuid());
    raise exception 'FAIL CS08: staff comentó en Publicada';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;

reset role;
do $$
begin
  -- CS09: la regla es interna (sin ejecución para anon/authenticated) y NULL = cerrado; grants de las RPC intactos.
  if has_function_privilege('anon', 'public.comments_open_for_status(text)', 'execute')
     or has_function_privilege('authenticated', 'public.comments_open_for_status(text)', 'execute') then
    raise exception 'FAIL CS09: comments_open_for_status ejecutable por anon/authenticated';
  end if;
  if public.comments_open_for_status(null) or public.comments_open_for_status('published')
     or not public.comments_open_for_status('approved') or not public.comments_open_for_status('discarded') then
    raise exception 'FAIL CS09b: comments_open_for_status no aplica la regla';
  end if;
  if has_function_privilege('anon', 'public.add_publication_comment(uuid, text, uuid[], uuid, uuid)', 'execute')
     or has_function_privilege('anon', 'public.edit_publication_comment(uuid, text, uuid[])', 'execute')
     or has_function_privilege('anon', 'public.delete_publication_comment(uuid)', 'execute')
     or has_function_privilege('anon', 'public.set_comment_reaction(uuid, text, boolean)', 'execute')
     or not has_function_privilege('authenticated', 'public.add_publication_comment(uuid, text, uuid[], uuid, uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.edit_publication_comment(uuid, text, uuid[])', 'execute')
     or not has_function_privilege('authenticated', 'public.delete_publication_comment(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.set_comment_reaction(uuid, text, boolean)', 'execute') then
    raise exception 'FAIL CS10: cambiaron los grants de las RPC de comentarios';
  end if;
  raise notice 'v1.6 comments-status checks: OK';
end $$;

rollback;
