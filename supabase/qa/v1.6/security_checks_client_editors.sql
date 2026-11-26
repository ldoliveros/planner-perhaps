-- Pruebas de 20261126000002_client_publication_editors.sql (permiso Lector/Editor del Client User) y
-- 20261126000003_publication_activity.sql (actividad de publicaciones).
--
-- Requiere las dos migraciones aplicadas. Rol postgres. Se corre con el guard:
--   node supabase/qa/v1.6/qa-db.mjs security-checks --suite client-editors --confirm wxkbkdoaohywqabmyqjk
-- NO DEJA RASTRO: todo termina en ROLLBACK (también el permiso Editor que se le da al Client User QA). Una aserción
-- fallida aborta con 'FAIL ..'. Solo usa los usuarios QA persistentes de CLAUDE.md y QA Sandbox.

begin;

-- ------------------------------------------------------------
-- Contexto (postgres)
-- ------------------------------------------------------------
do $$
declare
  v_client uuid; v_calendar uuid; v_ct uuid; v_ct2 uuid; v_cu uuid; v_am uuid; v_sa uuid;
  v_foreign_client uuid; v_foreign_calendar uuid; v_account uuid; v_account2 uuid; v_foreign_account uuid;
  v_pub uuid; v_pub2 uuid; v_arch uuid; v_foreign_pub uuid; v_published uuid;
begin
  select id into v_client from public.clients where slug = 'qa-sandbox';
  select id into v_calendar from public.calendars where client_id = v_client and name = 'QA General';
  select id into v_ct from public.content_types order by sort_order limit 1;
  select id into v_ct2 from public.content_types order by sort_order offset 1 limit 1;
  select id into v_cu from public.profiles where email = 'qa-client-user@perhaps-planner-qa.com';
  select id into v_am from public.profiles where email = 'qa-account-manager@perhaps-planner-qa.com';
  select id into v_sa from public.profiles where email = 'qa-super-admin@perhaps-planner-qa.com';
  select id into v_account from public.client_accounts where client_id = v_client order by sort_order, handle limit 1;
  select id into v_account2 from public.client_accounts where client_id = v_client and id <> v_account order by sort_order, handle limit 1;
  select c.id, k.id into v_foreign_client, v_foreign_calendar
  from public.clients c join public.calendars k on k.client_id = c.id where c.id <> v_client limit 1;
  if v_client is null or v_calendar is null or v_cu is null or v_am is null or v_sa is null or v_account2 is null
     or v_foreign_client is null then
    raise exception 'SETUP: falta el entorno QA persistente (ver CLAUDE.md)';
  end if;
  if exists (select 1 from public.client_publication_editors where user_id = v_cu) then
    raise exception 'SETUP: el Client User QA ya es Editor; la prueba arranca desde Lector';
  end if;
  insert into public.client_accounts (client_id, platform_id, handle)
  values (v_foreign_client, (select platform_id from public.client_accounts where id = v_account), 'qa-ce-ajena-temporal')
  returning id into v_foreign_account;

  insert into public.publications (calendar_id, client_id, title, publication_date, content_type_id, status_id, copy)
  values (v_calendar, v_client, 'QA CE 1 (temporal)', current_date, v_ct, (select id from public.statuses where key = 'draft'), 'texto')
  returning id into v_pub;
  insert into public.publication_destinations (publication_id, client_account_id) values (v_pub, v_account);
  insert into public.publications (calendar_id, client_id, title, publication_date, content_type_id, status_id)
  values (v_calendar, v_client, 'QA CE 2 (temporal)', current_date, v_ct, (select id from public.statuses where key = 'draft'))
  returning id into v_pub2;
  insert into public.publications (calendar_id, client_id, title, publication_date, content_type_id, status_id, archived_at)
  values (v_calendar, v_client, 'QA CE archivada (temporal)', current_date, v_ct, (select id from public.statuses where key = 'draft'), now())
  returning id into v_arch;
  insert into public.publications (calendar_id, client_id, title, publication_date, content_type_id, status_id)
  values (v_calendar, v_client, 'QA CE publicada (temporal)', current_date, v_ct, (select id from public.statuses where key = 'published'))
  returning id into v_published;
  insert into public.publications (calendar_id, client_id, title, publication_date, content_type_id, status_id)
  values (v_foreign_calendar, v_foreign_client, 'QA CE ajena (temporal)', current_date, v_ct, (select id from public.statuses where key = 'draft'))
  returning id into v_foreign_pub;

  -- Lo creado como postgres (sin auth.uid) NO genera actividad.
  if exists (select 1 from public.publication_activity where publication_id in (v_pub, v_pub2, v_arch, v_foreign_pub)) then
    raise exception 'FAIL PA00: cambios sin usuario (postgres/service) generaron actividad';
  end if;

  perform set_config('ce.client', v_client::text, true);
  perform set_config('ce.calendar', v_calendar::text, true);
  perform set_config('ce.ct', v_ct::text, true);
  perform set_config('ce.ct2', v_ct2::text, true);
  perform set_config('ce.cu', v_cu::text, true);
  perform set_config('ce.am', v_am::text, true);
  perform set_config('ce.sa', v_sa::text, true);
  perform set_config('ce.account', v_account::text, true);
  perform set_config('ce.account2', v_account2::text, true);
  perform set_config('ce.foreign_account', v_foreign_account::text, true);
  perform set_config('ce.foreign_calendar', v_foreign_calendar::text, true);
  perform set_config('ce.foreign_client', v_foreign_client::text, true);
  perform set_config('ce.pub', v_pub::text, true);
  perform set_config('ce.pub2', v_pub2::text, true);
  perform set_config('ce.arch', v_arch::text, true);
  perform set_config('ce.published', v_published::text, true);
  perform set_config('ce.foreign_pub', v_foreign_pub::text, true);
end $$;

-- ------------------------------------------------------------
-- CLIENT USER QA como LECTOR (sin fila de editor): nada se escribe, ni con llamadas directas.
-- ------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ce.cu'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  n int;
begin
  if public.is_client_publication_editor(current_setting('ce.client')::uuid) then
    raise exception 'FAIL CE01: el lector figura como editor';
  end if;
  begin
    insert into public.publications (calendar_id, title, publication_date, content_type_id, status_id)
    values (current_setting('ce.calendar')::uuid, 'lector crea', current_date, current_setting('ce.ct')::uuid,
            (select id from public.statuses where key = 'draft'));
    raise exception 'FAIL CE02: el lector creó una publicación';
  exception when insufficient_privilege then null;
  end;
  update public.publications set title = 'lector edita' where id = current_setting('ce.pub')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL CE03: el lector editó una publicación'; end if;
  begin
    insert into public.publication_destinations (publication_id, client_account_id)
    values (current_setting('ce.pub')::uuid, current_setting('ce.account2')::uuid);
    raise exception 'FAIL CE04: el lector agregó un destino';
  exception when insufficient_privilege then null;
  end;
  delete from public.publication_destinations where publication_id = current_setting('ce.pub')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL CE04b: el lector quitó un destino'; end if;
  begin
    insert into public.publication_assets (publication_id, type, filename, thumbnail_url)
    values (current_setting('ce.pub')::uuid, 'image', 'x.webp', current_setting('ce.client') || '/' || current_setting('ce.pub') || '/x.webp');
    raise exception 'FAIL CE05: el lector agregó un archivo';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('thumbnails', current_setting('ce.client') || '/' || current_setting('ce.pub') || '/lector.webp', auth.uid());
    raise exception 'FAIL CE06: el lector subió a Storage';
  exception when insufficient_privilege then null;
  end;
  -- Lectura intacta: ve sus publicaciones (no archivadas) y la actividad de su cliente.
  if not exists (select 1 from public.publications where id = current_setting('ce.pub')::uuid) then
    raise exception 'FAIL CE07: el lector dejó de ver publicaciones de su cliente';
  end if;
end $$;
reset role;

-- Se le da el permiso Editor (como lo hace la server action, con service_role/postgres).
insert into public.client_publication_editors (client_id, user_id, granted_by)
values (current_setting('ce.client')::uuid, current_setting('ce.cu')::uuid, current_setting('ce.sa')::uuid);

-- ------------------------------------------------------------
-- CLIENT USER QA como EDITOR
-- ------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ce.cu'), 'role', 'authenticated')::text, true);
select set_config('request.headers', json_build_object('x-planner-save-id', '11111111-1111-4111-8111-111111111111')::text, true);
set local role authenticated;
do $$
declare
  n int;
  v_new uuid;
  v_ev record;
begin
  if not public.is_client_publication_editor(current_setting('ce.client')::uuid) then
    raise exception 'FAIL CE10: el editor no figura como editor';
  end if;
  if public.is_client_publication_editor(current_setting('ce.foreign_client')::uuid) then
    raise exception 'FAIL CE10b: el editor figura como editor de otro cliente';
  end if;
  if public.can_manage_client(current_setting('ce.client')::uuid) then
    raise exception 'FAIL CE10c: el editor obtuvo can_manage_client';
  end if;

  -- CE11: editar textos, título, tipo, fecha/hora y estado en UN guardado (save 1111…), más destinos y un archivo.
  update public.publications
     set title = 'QA CE 1 editada', copy = 'texto nuevo', content_type_id = current_setting('ce.ct2')::uuid,
         publication_date = current_date + 3, publication_time = '18:00',
         status_id = (select id from public.statuses where key = 'in_review')
   where id = current_setting('ce.pub')::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL CE11: el editor no pudo editar su publicación'; end if;
  delete from public.publication_destinations where publication_id = current_setting('ce.pub')::uuid;
  insert into public.publication_destinations (publication_id, client_account_id)
  values (current_setting('ce.pub')::uuid, current_setting('ce.account2')::uuid);
  insert into public.publication_assets (publication_id, type, filename, thumbnail_url, is_primary)
  values (current_setting('ce.pub')::uuid, 'image', 'x.webp', current_setting('ce.client') || '/' || current_setting('ce.pub') || '/x.webp', true);
  insert into storage.objects (bucket_id, name, owner)
  values ('thumbnails', current_setting('ce.client') || '/' || current_setting('ce.pub') || '/x.webp', auth.uid());

  -- PA01: un solo evento para ese guardado, con todos los cambios y el actor de la sesión.
  select count(*) into n from public.publication_activity where publication_id = current_setting('ce.pub')::uuid;
  if n <> 1 then raise exception 'FAIL PA01: se esperaban 1 evento agrupado y hay %', n; end if;
  select * into v_ev from public.publication_activity where publication_id = current_setting('ce.pub')::uuid;
  if v_ev.actor_id <> current_setting('ce.cu')::uuid or v_ev.actor_role <> 'client' then
    raise exception 'FAIL PA01b: actor incorrecto';
  end if;
  if not (v_ev.changes ? 'title' and v_ev.changes ? 'copy' and v_ev.changes ? 'content_type' and v_ev.changes ? 'schedule'
          and v_ev.changes ? 'status' and v_ev.changes ? 'destinations' and (v_ev.changes ->> 'files_added')::int = 1) then
    raise exception 'FAIL PA01c: faltan cambios en el evento: %', v_ev.changes;
  end if;
  if v_ev.changes -> 'schedule' ->> 'time' <> '18:00' or v_ev.changes -> 'status' ->> 'key' <> 'in_review'
     or jsonb_array_length(v_ev.changes -> 'destinations') <> 1 then
    raise exception 'FAIL PA01d: valores nuevos incorrectos: %', v_ev.changes;
  end if;

  -- PA02: guardar sin cambios (mismos valores) no genera eventos nuevos ni modifica el existente.
  perform set_config('request.headers', json_build_object('x-planner-save-id', '22222222-2222-4222-8222-222222222222')::text, true);
  update public.publications set title = 'QA CE 1 editada', copy = 'texto nuevo' where id = current_setting('ce.pub')::uuid;
  update public.publication_assets set sort_order = sort_order, is_primary = is_primary where publication_id = current_setting('ce.pub')::uuid;
  select count(*) into n from public.publication_activity where publication_id = current_setting('ce.pub')::uuid;
  if n <> 1 then raise exception 'FAIL PA02: un guardado sin cambios generó actividad (% eventos)', n; end if;

  -- CE12: crear en su cliente (save 3333…): un evento "created" (con destinos agrupados).
  perform set_config('request.headers', json_build_object('x-planner-save-id', '33333333-3333-4333-8333-333333333333')::text, true);
  insert into public.publications (calendar_id, title, publication_date, content_type_id, status_id)
  values (current_setting('ce.calendar')::uuid, 'QA CE creada por editor (temporal)', current_date, current_setting('ce.ct')::uuid,
          (select id from public.statuses where key = 'draft'))
  returning id into v_new;
  insert into public.publication_destinations (publication_id, client_account_id) values (v_new, current_setting('ce.account')::uuid);
  select count(*) into n from public.publication_activity where publication_id = v_new and changes ? 'created';
  if n <> 1 or (select count(*) from public.publication_activity where publication_id = v_new) <> 1 then
    raise exception 'FAIL CE12: la creación no quedó como un único evento';
  end if;

  -- CE13: otro cliente — calendario, publicación, cuenta, archivo y Storage ajenos.
  begin
    insert into public.publications (calendar_id, title, publication_date, content_type_id, status_id)
    values (current_setting('ce.foreign_calendar')::uuid, 'ajena', current_date, current_setting('ce.ct')::uuid,
            (select id from public.statuses where key = 'draft'));
    raise exception 'FAIL CE13: creó en el calendario de otro cliente';
  exception when raise_exception or insufficient_privilege then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  begin
    update public.publications set calendar_id = current_setting('ce.foreign_calendar')::uuid where id = current_setting('ce.pub')::uuid;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL CE13b: movió su publicación a otro cliente'; end if;
  exception when raise_exception or insufficient_privilege then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  update public.publications set title = 'ajena editada' where id = current_setting('ce.foreign_pub')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL CE13c: editó una publicación de otro cliente'; end if;
  begin
    insert into public.publication_destinations (publication_id, client_account_id)
    values (current_setting('ce.pub')::uuid, current_setting('ce.foreign_account')::uuid);
    raise exception 'FAIL CE13d: usó una cuenta de otro cliente';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.publication_destinations (publication_id, client_account_id)
    values (current_setting('ce.foreign_pub')::uuid, current_setting('ce.account')::uuid);
    raise exception 'FAIL CE13e: agregó destinos a una publicación de otro cliente';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.publication_assets (publication_id, type, filename, thumbnail_url)
    values (current_setting('ce.pub')::uuid, 'image', 'y.webp', current_setting('ce.foreign_client') || '/' || current_setting('ce.foreign_pub') || '/y.webp');
    raise exception 'FAIL CE13f: apuntó un archivo a la carpeta de otro cliente';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.publication_assets (publication_id, type, filename, thumbnail_url)
    values (current_setting('ce.pub')::uuid, 'image', 'y.webp', current_setting('ce.client') || '/' || current_setting('ce.pub2') || '/y.webp');
    raise exception 'FAIL CE13g: apuntó un archivo a la carpeta de otra publicación';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('thumbnails', current_setting('ce.foreign_client') || '/' || current_setting('ce.foreign_pub') || '/y.webp', auth.uid());
    raise exception 'FAIL CE13h: subió a la carpeta de Storage de otro cliente';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('client-logos', current_setting('ce.client') || '/logo.webp', auth.uid());
    raise exception 'FAIL CE13i: subió al bucket de logos';
  exception when insufficient_privilege then null;
  end;

  -- CE14: no elimina, no archiva, no restaura.
  delete from public.publications where id = current_setting('ce.pub')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL CE14: el editor eliminó una publicación'; end if;
  begin
    update public.publications set archived_at = now() where id = current_setting('ce.pub')::uuid;
    raise exception 'FAIL CE14b: el editor archivó una publicación';
  exception when raise_exception or insufficient_privilege then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  update public.publications set archived_at = null where id = current_setting('ce.arch')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL CE14c: el editor restauró una publicación archivada'; end if;

  -- CE15: no administra (clientes, calendarios, cuentas, campañas, usuarios, permisos).
  begin
    insert into public.client_publication_editors (client_id, user_id) values (current_setting('ce.client')::uuid, auth.uid());
    raise exception 'FAIL CE15: escribió la tabla de permisos';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.client_publication_editors where user_id = auth.uid();
    raise exception 'FAIL CE15b: borró la tabla de permisos';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.calendars (client_id, name, slug) values (current_setting('ce.client')::uuid, 'QA CE cal', 'qa-ce-cal');
    raise exception 'FAIL CE15c: creó un calendario';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.client_accounts (client_id, platform_id, handle)
    values (current_setting('ce.client')::uuid, (select platform_id from public.client_accounts where id = current_setting('ce.account')::uuid), 'qa-ce-x');
    raise exception 'FAIL CE15d: creó una cuenta';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.campaigns (client_id, name) values (current_setting('ce.client')::uuid, 'QA CE campaña');
    raise exception 'FAIL CE15e: creó una campaña';
  exception when insufficient_privilege then null;
  end;
  update public.clients set name = name where id = current_setting('ce.client')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL CE15f: modificó el cliente'; end if;
  begin
    update public.profiles set role = 'super_admin', client_id = null where id = auth.uid();
  exception when insufficient_privilege then null;
  end;
  if (select role from public.profiles where id = auth.uid()) <> 'client' then
    raise exception 'FAIL CE15g: se cambió el rol';
  end if;

  -- PA03: nadie escribe la actividad directo.
  begin
    insert into public.publication_activity (publication_id, client_id, actor_id, actor_name, save_key)
    values (current_setting('ce.pub')::uuid, current_setting('ce.client')::uuid, current_setting('ce.am')::uuid, 'falso', 'x');
    raise exception 'FAIL PA03: insertó actividad directo';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.publication_activity set actor_name = 'falso';
    raise exception 'FAIL PA03b: modificó actividad';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.publication_activity;
    raise exception 'FAIL PA03c: borró actividad';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_publication_activity(current_setting('ce.pub')::uuid, current_setting('ce.client')::uuid, '{"title":"x"}');
    raise exception 'FAIL PA03d: ejecutó record_publication_activity';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ------------------------------------------------------------
-- STAFF (Account Manager asignado): su cambio de estado (sin header = su propio evento), y actividad ajena aislada.
-- ------------------------------------------------------------
select set_config('request.headers', '{}', true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ce.am'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  n int;
begin
  update public.publications set status_id = (select id from public.statuses where key = 'approved')
   where id = current_setting('ce.pub')::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'SETUP: el Account Manager QA no pudo cambiar el estado'; end if;
  select count(*) into n from public.publication_activity
   where publication_id = current_setting('ce.pub')::uuid and actor_id = current_setting('ce.am')::uuid
     and changes -> 'status' ->> 'label' is not null and actor_role = 'account_manager';
  if n <> 1 then raise exception 'FAIL PA04: el cambio de estado de staff no quedó como evento propio'; end if;
  -- Staff sigue pudiendo archivar (el guard solo aplica a quien no gestiona el cliente).
  update public.publications set archived_at = now() where id = current_setting('ce.pub2')::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL CE16: el staff ya no puede archivar'; end if;
end $$;
reset role;

-- Actividad en la publicación ajena hecha por el Super Admin QA.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ce.sa'), 'role', 'authenticated')::text, true);
set local role authenticated;
update public.publications set title = 'QA CE ajena editada' where id = current_setting('ce.foreign_pub')::uuid;
reset role;

-- ------------------------------------------------------------
-- CLIENT USER: lectura de la actividad y revocación
-- ------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ce.cu'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.publication_activity where publication_id = current_setting('ce.pub')::uuid) <> 2 then
    raise exception 'FAIL PA05: el cliente no ve la actividad de su publicación (editor + staff)';
  end if;
  if exists (select 1 from public.publication_activity where publication_id = current_setting('ce.foreign_pub')::uuid) then
    raise exception 'FAIL PA06: el cliente ve actividad de otro cliente';
  end if;
  if exists (select 1 from public.publication_activity where publication_id = current_setting('ce.pub2')::uuid) then
    raise exception 'FAIL PA06b: el cliente ve actividad de una publicación archivada';
  end if;
end $$;
reset role;

delete from public.client_publication_editors where user_id = current_setting('ce.cu')::uuid;

set local role authenticated;
do $$
declare
  n int;
begin
  -- CE17: revocado, ya no escribe (aunque tenga la pestaña abierta: la base decide en cada request).
  update public.publications set title = 'revocado edita' where id = current_setting('ce.pub')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL CE17: con el permiso revocado siguió editando'; end if;
  begin
    insert into public.publications (calendar_id, title, publication_date, content_type_id, status_id)
    values (current_setting('ce.calendar')::uuid, 'revocado crea', current_date, current_setting('ce.ct')::uuid,
            (select id from public.statuses where key = 'draft'));
    raise exception 'FAIL CE17b: con el permiso revocado siguió creando';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('thumbnails', current_setting('ce.client') || '/' || current_setting('ce.pub') || '/revocado.webp', auth.uid());
    raise exception 'FAIL CE17c: con el permiso revocado siguió subiendo a Storage';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$
begin
  -- Grants y funciones internas.
  if has_table_privilege('authenticated', 'public.client_publication_editors', 'insert')
     or has_table_privilege('authenticated', 'public.client_publication_editors', 'update')
     or has_table_privilege('authenticated', 'public.client_publication_editors', 'delete')
     or has_table_privilege('anon', 'public.client_publication_editors', 'select')
     or has_table_privilege('authenticated', 'public.publication_activity', 'insert')
     or has_table_privilege('authenticated', 'public.publication_activity', 'update')
     or has_table_privilege('authenticated', 'public.publication_activity', 'delete')
     or has_table_privilege('anon', 'public.publication_activity', 'select')
     or has_function_privilege('authenticated', 'public.record_publication_activity(uuid, uuid, jsonb)', 'execute')
     or has_function_privilege('anon', 'public.is_client_publication_editor(uuid)', 'execute') then
    raise exception 'FAIL CE18: grants inesperados';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'publication_activity') then
    raise exception 'FAIL PA07: publication_activity no está en supabase_realtime';
  end if;
  raise notice 'client-editors checks: OK';
end $$;

rollback;
