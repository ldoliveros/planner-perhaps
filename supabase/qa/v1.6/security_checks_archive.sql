-- v1.6 — Pruebas de 20261017000001_v16_publication_archive.sql y 20261017000002_v16_publication_changes.sql.
--
-- NO EJECUTAR sin autorización. Requiere ambas migraciones aplicadas (o el dry-run del guard). Rol postgres.
-- NO DEJA RASTRO: todo termina en ROLLBACK. Una aserción fallida aborta con 'FAIL AR../PC..'. Si todo pasa, el último
-- NOTICE es "v1.6 archive checks: OK". Solo usa los usuarios QA persistentes de CLAUDE.md.

begin;

do $$
declare
  v_client uuid; v_calendar uuid; v_ct uuid; v_cu uuid; v_am uuid; v_foreign_client uuid; v_foreign_pub uuid;
  v_pub uuid; v_comment uuid; v_status uuid;
begin
  select id into v_client from public.clients where slug = 'qa-sandbox';
  select id into v_calendar from public.calendars where client_id = v_client and name = 'QA General';
  select id into v_ct from public.content_types order by sort_order limit 1;
  select id into v_status from public.statuses where key = 'in_review';
  select id into v_cu from public.profiles where email = 'qa-client-user@perhaps-planner-qa.com';
  select id into v_am from public.profiles where email = 'qa-account-manager@perhaps-planner-qa.com';
  select id, client_id into v_foreign_pub, v_foreign_client from public.publications where client_id <> v_client limit 1;
  if v_client is null or v_calendar is null or v_cu is null or v_am is null then
    raise exception 'SETUP: falta el entorno QA persistente (ver CLAUDE.md)';
  end if;

  insert into public.publications (calendar_id, client_id, title, publication_date, content_type_id, status_id)
  values (v_calendar, v_client, 'QA v1.6 AR archivo (temporal)', current_date, v_ct, v_status)
  returning id into v_pub;
  insert into public.publication_comments (publication_id, client_id, author_id, author_name, author_role, body, request_id)
  values (v_pub, v_client, v_am, 'QA AM', 'account_manager', 'antes de archivar', gen_random_uuid())
  returning id into v_comment;

  -- PC01: crear la publicación registró un aviso 'upsert' para su cliente.
  if not exists (select 1 from public.publication_changes where publication_id = v_pub and client_id = v_client and kind = 'upsert') then
    raise exception 'FAIL PC01: crear la publicación no registró el aviso';
  end if;

  perform set_config('ar.client', v_client::text, true);
  perform set_config('ar.pub', v_pub::text, true);
  perform set_config('ar.comment', v_comment::text, true);
  perform set_config('ar.cu', v_cu::text, true);
  perform set_config('ar.am', v_am::text, true);
  perform set_config('ar.status', v_status::text, true);
  perform set_config('ar.foreign_pub', coalesce(v_foreign_pub::text, ''), true);
end $$;

-- ------------------------------------------------------------
-- ACCOUNT MANAGER: archiva (UPDATE permitido por publications_manage)
-- ------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ar.am'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_pub uuid := current_setting('ar.pub')::uuid;
  v_rows integer;
begin
  update public.publications set archived_at = now(), archived_by = auth.uid() where id = v_pub and archived_at is null;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'FAIL AR01: el AM no pudo archivar'; end if;
  -- AR02: el staff sigue viéndola (para el listado de archivadas), con sus comentarios.
  if not exists (select 1 from public.publications where id = v_pub and archived_at is not null)
     or not exists (select 1 from public.publication_comments where publication_id = v_pub) then
    raise exception 'FAIL AR02: el staff no ve la archivada o sus comentarios';
  end if;
  -- AR03: archivada = solo lectura (editar sin restaurar falla).
  begin
    update public.publications set title = 'cambio' where id = v_pub;
    raise exception 'FAIL AR03: se editó una publicación archivada';
  exception when raise_exception then null;
  end;
end $$;
reset role;

do $$
begin
  -- AR04: archivar no cambió el estado editorial.
  if (select status_id::text from public.publications where id = current_setting('ar.pub')::uuid) <> current_setting('ar.status') then
    raise exception 'FAIL AR04: archivar cambió el estado';
  end if;
  -- PC02: archivar registró otro aviso 'upsert'.
  if (select count(*) from public.publication_changes where publication_id = current_setting('ar.pub')::uuid and kind = 'upsert') < 2 then
    raise exception 'FAIL PC02: archivar no registró el aviso';
  end if;
end $$;

-- ------------------------------------------------------------
-- CLIENT USER: no ve la archivada ni sus datos relacionados; sí recibe el aviso de su cliente
-- ------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ar.cu'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_pub uuid := current_setting('ar.pub')::uuid;
begin
  if exists (select 1 from public.publications where id = v_pub) then
    raise exception 'FAIL AR05: el Client User ve una publicación archivada';
  end if;
  if exists (select 1 from public.publication_comments where publication_id = v_pub)
     or exists (select 1 from public.publication_status_events where publication_id = v_pub)
     or exists (select 1 from public.publication_destinations where publication_id = v_pub)
     or exists (select 1 from public.publication_assets where publication_id = v_pub) then
    raise exception 'FAIL AR06: el Client User ve datos relacionados de una archivada';
  end if;
  -- AR07: no puede comentar ni reaccionar en la archivada.
  begin
    perform public.add_publication_comment(v_pub, 'intento', '{}', gen_random_uuid());
    raise exception 'FAIL AR07a: comentó en una archivada';
  exception when insufficient_privilege or raise_exception then null;
  end;
  begin
    perform public.set_comment_reaction(current_setting('ar.comment')::uuid, '👍', true);
    raise exception 'FAIL AR07b: reaccionó en una archivada';
  exception when insufficient_privilege or raise_exception then null;
  end;
  -- PC03: el aviso de su cliente le llega (para quitarla de su Planner abierto).
  if not exists (select 1 from public.publication_changes where publication_id = v_pub) then
    raise exception 'FAIL PC03: el Client User no ve los avisos de su cliente';
  end if;
  -- PC04: sin escritura directa en los avisos.
  begin
    insert into public.publication_changes (publication_id, client_id, kind) values (v_pub, current_setting('ar.client')::uuid, 'upsert');
    raise exception 'FAIL PC04: insert directo en publication_changes';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ------------------------------------------------------------
-- RESTAURAR (AM) y verificar que todo vuelve
-- ------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ar.am'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_rows integer;
begin
  update public.publications set archived_at = null, archived_by = null
  where id = current_setting('ar.pub')::uuid and archived_at is not null;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'FAIL AR08: el AM no pudo restaurar'; end if;
end $$;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('ar.cu'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  -- AR09: restaurada, el Client User la vuelve a ver con su comentario, mismo estado.
  if not exists (
    select 1 from public.publications
    where id = current_setting('ar.pub')::uuid and status_id::text = current_setting('ar.status')
  ) or not exists (select 1 from public.publication_comments where id = current_setting('ar.comment')::uuid) then
    raise exception 'FAIL AR09: restaurar no devolvió la publicación o sus datos';
  end if;
end $$;
reset role;

-- ------------------------------------------------------------
-- ELIMINAR, aislamiento y Realtime (como postgres)
-- ------------------------------------------------------------
do $$
declare
  v_pub uuid := current_setting('ar.pub')::uuid;
begin
  delete from public.publications where id = v_pub;
  -- PC05: eliminar registró un aviso 'delete' con el cliente de la publicación.
  if not exists (select 1 from public.publication_changes where publication_id = v_pub and kind = 'delete'
                 and client_id = current_setting('ar.client')::uuid) then
    raise exception 'FAIL PC05: eliminar no registró el aviso';
  end if;
  -- PC06: `publications` ya no está en Realtime; publication_changes sí, con RLS y replica identity DEFAULT.
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'publications')
     or not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'publication_changes')
     or exists (select 1 from pg_class where relname = 'publication_changes' and (not relrowsecurity or relreplident <> 'd')) then
    raise exception 'FAIL PC06: publicación Realtime inesperada';
  end if;
  -- PC07: grants.
  if has_table_privilege('anon', 'public.publication_changes', 'select')
     or has_table_privilege('authenticated', 'public.publication_changes', 'insert')
     or has_function_privilege('authenticated', 'public.log_publication_change()', 'execute') then
    raise exception 'FAIL PC07: grants de más en publication_changes';
  end if;
end $$;

-- PC08: aislamiento — el Client User QA no ve avisos de otros clientes.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('ar.cu'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.publication_changes where client_id <> current_setting('ar.client')::uuid) then
    raise exception 'FAIL PC08: el Client User ve avisos de otros clientes';
  end if;
  raise notice 'v1.6 archive checks: OK';
end $$;
reset role;

rollback;
