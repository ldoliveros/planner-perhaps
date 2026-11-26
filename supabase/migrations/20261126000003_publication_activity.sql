-- Actividad de publicaciones ("Comentarios y actividad"): registro persistente de cambios relevantes, hecho por
-- triggers (no por la app), así que nadie puede crear, editar ni borrar eventos con su JWT y el actor es SIEMPRE
-- auth.uid() de la sesión.
--
-- Qué se registra (solo el valor NUEVO, nunca el anterior ni diferencias de texto):
--   publications INSERT                          -> created
--   publications UPDATE                           -> schedule {date,time} · status {key,label} · title · copy ·
--                                                    content_type · calendar · campaign · drive · trello
--   publication_destinations INSERT / DELETE      -> destinations [{platform, handle}] (conjunto vigente)
--   publication_assets INSERT / DELETE / UPDATE   -> files_added n · files_removed n · cover · files_reordered
-- Sin cambios reales no hay evento (las columnas se comparan con IS DISTINCT FROM; archivar/restaurar no se registra).
--
-- Agrupación por guardado: un guardado del editor son varias requests (publicación, destinos, archivos). La app manda
-- el mismo header `x-planner-save-id` en todas; los triggers suman los cambios en UN evento por
-- (publicación, actor, guardado), dentro de 15 minutos. Sin header (cambio rápido de estado, mover de fecha, aprobar),
-- cada transacción es su propio evento. El header solo agrupa eventos del MISMO actor: no permite suplantar a nadie.
--
-- Nunca bloquea un guardado: cualquier falla al registrar se degrada a WARNING (mismo criterio que
-- log_publication_change). No genera notificaciones ni emails. No hay actividad histórica (empieza vacía).
-- Lectura: misma regla que comentarios / historial de estados (can_view_client; archivadas solo staff).
-- Realtime: la tabla se publica en supabase_realtime; los eventos son solo una señal y la app relee bajo RLS.
--
-- Rollback: supabase/rollback/client-editors-activity/rollback.sql (bloque PA).

-- ============================================================
-- 0) GUARD
-- ============================================================
do $$
begin
  if to_regclass('public.publication_activity') is not null then
    raise exception 'publication_activity: ya existe la tabla; abortado sin cambios.';
  end if;
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables = false) then
    raise exception 'publication_activity: supabase_realtime no existe o es FOR ALL TABLES; abortado sin cambios.';
  end if;
end $$;

-- ============================================================
-- 1) TABLA
-- ============================================================
create table public.publication_activity (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.publications (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_name text not null,
  actor_avatar_url text,
  actor_role text,
  save_key text not null,
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index publication_activity_publication_idx on public.publication_activity (publication_id, created_at desc);
create index publication_activity_group_idx on public.publication_activity (publication_id, actor_id, save_key);

alter table public.publication_activity enable row level security;
create policy publication_activity_select on public.publication_activity
  for select to authenticated using (
    public.can_view_client(client_id)
    and (public.can_manage_client(client_id) or public.publication_is_archived(publication_id) is not true)
  );

revoke all on public.publication_activity from public, anon, authenticated;
grant select on public.publication_activity to authenticated;
grant select on public.publication_activity to service_role;

-- ============================================================
-- 2) REGISTRO (interno: solo lo llaman los triggers)
-- ============================================================
create function public.record_publication_activity(p_publication_id uuid, p_client_id uuid, p_changes jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_header text;
  v_key text;
  v_id uuid;
  v_prev jsonb;
  v_merged jsonb;
  v_counter text;
begin
  if v_actor is null or p_changes is null or p_changes = '{}'::jsonb then
    return;
  end if;

  begin
    v_header := nullif(current_setting('request.headers', true), '')::json ->> 'x-planner-save-id';
  exception when others then
    v_header := null;
  end;
  if v_header ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_key := 'save:' || v_header;
  else
    v_key := 'tx:' || txid_current()::text;
  end if;

  select a.id, a.changes into v_id, v_prev
  from public.publication_activity a
  where a.publication_id = p_publication_id
    and a.actor_id = v_actor
    and a.save_key = v_key
    and a.created_at > now() - interval '15 minutes'
  order by a.created_at desc
  limit 1
  for update;

  if v_id is not null then
    v_merged := v_prev || p_changes;
    foreach v_counter in array array['files_added', 'files_removed'] loop
      if v_prev ? v_counter and p_changes ? v_counter then
        v_merged := jsonb_set(v_merged, array[v_counter], to_jsonb((v_prev ->> v_counter)::int + (p_changes ->> v_counter)::int));
      end if;
    end loop;
    update public.publication_activity set changes = v_merged, updated_at = now() where id = v_id;
  else
    insert into public.publication_activity (
      publication_id, client_id, actor_id, actor_name, actor_avatar_url, actor_role, save_key, changes
    )
    select p_publication_id, p_client_id, v_actor, public.profile_display_name(p.full_name, p.role), p.avatar_url, p.role,
           v_key, p_changes
    from public.profiles p
    where p.id = v_actor;
  end if;
end;
$$;
revoke execute on function public.record_publication_activity(uuid, uuid, jsonb) from public, anon, authenticated;

-- ============================================================
-- 3) TRIGGERS
-- ============================================================
create function public.log_publication_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_changes jsonb := '{}'::jsonb;
begin
  begin
    if tg_op = 'INSERT' then
      v_changes := jsonb_build_object('created', true);
    else
      if new.publication_date is distinct from old.publication_date or new.publication_time is distinct from old.publication_time then
        v_changes := v_changes || jsonb_build_object(
          'schedule', jsonb_build_object('date', new.publication_date, 'time', to_char(new.publication_time, 'HH24:MI'))
        );
      end if;
      if new.status_id is distinct from old.status_id then
        v_changes := v_changes || jsonb_build_object(
          'status', (select jsonb_build_object('key', s.key, 'label', s.label) from public.statuses s where s.id = new.status_id)
        );
      end if;
      if new.title is distinct from old.title then
        v_changes := v_changes || jsonb_build_object('title', new.title);
      end if;
      if new.copy is distinct from old.copy then
        v_changes := v_changes || jsonb_build_object('copy', true);
      end if;
      if new.content_type_id is distinct from old.content_type_id then
        v_changes := v_changes || jsonb_build_object(
          'content_type', (select ct.label from public.content_types ct where ct.id = new.content_type_id)
        );
      end if;
      if new.calendar_id is distinct from old.calendar_id then
        v_changes := v_changes || jsonb_build_object(
          'calendar', (select c.name from public.calendars c where c.id = new.calendar_id)
        );
      end if;
      if new.campaign_id is distinct from old.campaign_id then
        v_changes := v_changes || jsonb_build_object(
          'campaign', (select c.name from public.campaigns c where c.id = new.campaign_id)
        );
      end if;
      if new.drive_folder_url is distinct from old.drive_folder_url then
        v_changes := v_changes || jsonb_build_object('drive', new.drive_folder_url is not null);
      end if;
      if new.trello_url is distinct from old.trello_url then
        v_changes := v_changes || jsonb_build_object('trello', new.trello_url is not null);
      end if;
    end if;
    perform public.record_publication_activity(new.id, new.client_id, v_changes);
  exception when others then
    raise warning 'log_publication_activity: actividad omitida para %: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;
revoke execute on function public.log_publication_activity() from public, anon, authenticated;

create trigger publications_activity
  after insert or update on public.publications
  for each row execute function public.log_publication_activity();

create function public.log_publication_destinations_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_publication_id uuid := coalesce(new.publication_id, old.publication_id);
  v_client_id uuid;
  v_destinations jsonb;
begin
  begin
    -- Borrado en cascada de la publicación: ya no existe y no hay nada que registrar.
    select p.client_id into v_client_id from public.publications p where p.id = v_publication_id;
    if v_client_id is null then
      return null;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('platform', pl.name, 'handle', a.handle) order by pl.name, a.handle), '[]'::jsonb)
      into v_destinations
    from public.publication_destinations d
    join public.client_accounts a on a.id = d.client_account_id
    join public.platforms pl on pl.id = a.platform_id
    where d.publication_id = v_publication_id;
    perform public.record_publication_activity(v_publication_id, v_client_id, jsonb_build_object('destinations', v_destinations));
  exception when others then
    raise warning 'log_publication_destinations_activity: actividad omitida para %: %', v_publication_id, sqlerrm;
  end;
  return null;
end;
$$;
revoke execute on function public.log_publication_destinations_activity() from public, anon, authenticated;

create trigger publication_destinations_activity
  after insert or delete on public.publication_destinations
  for each row execute function public.log_publication_destinations_activity();

create function public.log_publication_assets_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_publication_id uuid := coalesce(new.publication_id, old.publication_id);
  v_client_id uuid;
  v_changes jsonb := '{}'::jsonb;
begin
  begin
    select p.client_id into v_client_id from public.publications p where p.id = v_publication_id;
    if v_client_id is null then
      return null;
    end if;
    if tg_op = 'INSERT' then
      v_changes := jsonb_build_object('files_added', 1);
    elsif tg_op = 'DELETE' then
      v_changes := jsonb_build_object('files_removed', 1);
    elsif new.thumbnail_url is distinct from old.thumbnail_url
      or new.drive_file_url is distinct from old.drive_file_url
      or new.drive_file_id is distinct from old.drive_file_id then
      v_changes := jsonb_build_object('cover', true);
    elsif new.sort_order is distinct from old.sort_order or new.is_primary is distinct from old.is_primary then
      v_changes := jsonb_build_object('files_reordered', true);
    end if;
    perform public.record_publication_activity(v_publication_id, v_client_id, v_changes);
  exception when others then
    raise warning 'log_publication_assets_activity: actividad omitida para %: %', v_publication_id, sqlerrm;
  end;
  return null;
end;
$$;
revoke execute on function public.log_publication_assets_activity() from public, anon, authenticated;

create trigger publication_assets_activity
  after insert or update or delete on public.publication_assets
  for each row execute function public.log_publication_assets_activity();

-- ============================================================
-- 4) REALTIME (señal para actualizar la cronología sin recargar)
-- ============================================================
alter publication supabase_realtime add table public.publication_activity;
