-- Reglas de notificaciones internas (campanita) — revisión, aprobación, comentarios, Publicada/Descartada,
-- reprogramación, creación por Cliente Editor, aprobación invalidada, archivadas.
--
-- Destinatarios (siempre activos en Auth, con acceso vigente y nunca el actor):
--   * "usuarios cliente" = Client Users del cliente (Lector y Editor por igual).
--   * "equipo asignado"  = Account Managers y Super Admins ASIGNADOS al cliente.
--
--   En revisión (staff)            -> usuarios cliente              review_requested
--   En revisión (cliente)          -> equipo asignado               review_requested
--   Aprobada (cliente, solo RPC)   -> equipo asignado               approved_by_client
--   Aprobada (staff)               -> usuarios cliente              approved_by_agency
--   Publicada / Descartada         -> usuarios cliente              published / discarded
--   Aprobada -> Borrador/En revisión, o contenido aprobado modificado (vuelve a En revisión en la MISMA operación)
--                                  -> usuarios cliente + equipo     approval_invalidated
--   Fecha u hora cambiada          -> usuarios cliente + equipo     rescheduled (la programación inicial no cuenta)
--   Creada por Cliente Editor      -> equipo asignado               created_by_client
--   Comentario                     -> cliente: equipo asignado · staff: usuarios cliente · + participantes previos
--   Respuesta                      -> + autor del comentario original
--   Mención                        -> mencionado (miembro activo)
--
-- Un aviso por destinatario y evento:
--   * Comentarios: prioridad mención > respuesta > comentario (una fila por destinatario y comentario).
--   * Cambios de la publicación: UNA fila por destinatario y guardado (event_key 'pub:<pub>:<actor>:<guardado>'); el
--     guardado es el header `x-planner-save-id` (o la transacción). Si un mismo guardado produce varias señales (fecha,
--     invalidación por destinos o archivos), la fila se actualiza: gana el tipo de mayor prioridad y `details` acumula
--     la fecha nueva. La fila solo vuelve a "no leída" si cambió su contenido.
--
-- Aprobación del cliente: SOLO por approve_publication_as_client (validación de versión). Un UPDATE/INSERT directo de
-- un Client User a Aprobada se rechaza (no se puede eludir por API). Cambios en destinos o archivos actualizan la
-- versión (updated_at) de la publicación: una aprobación pendiente nunca se basa en una versión anterior.
-- Contenido aprobado = título, copy, carpeta de material (drive_folder_url), destinos, portada y archivos. Un cambio
-- solo de fecha/hora conserva la aprobación. Nada se aplica retroactivamente.
--
-- Archivadas: al archivar, sus avisos pendientes quedan `suppressed_at` (fuera de pendientes, contador y agenda, sin
-- marcarlos leídos); al restaurar no vuelven a pendientes. Emails de colaboración: sin cambios (siguen pausados por
-- `v16_collab_emails`). Reacciones: sin avisos.
--
-- Rollback: supabase/rollback/notification-rules/rollback.sql

-- ============================================================
-- 0) GUARD
-- ============================================================
do $$
begin
  if to_regclass('public.notifications') is null or to_regclass('public.publication_activity') is null
     or to_regclass('public.client_publication_editors') is null then
    raise exception 'notification_rules: faltan migraciones previas (v1.6 / editores / actividad); abortado sin cambios.';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name in ('details', 'suppressed_at')
  ) then
    raise exception 'notification_rules: notifications ya tiene details/suppressed_at (¿ya se aplicó?); abortado sin cambios.';
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'notifications_type_check' and conrelid = 'public.notifications'::regclass
  ) then
    raise exception 'notification_rules: no existe notifications_type_check; abortado sin cambios.';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'notification_rank', 'has_client_notification_access', 'upsert_publication_notification',
      'notify_publication_change', 'apply_publication_approval_rules', 'publication_content_changed'
    )
  ) then
    raise exception 'notification_rules: ya existen funciones con estos nombres; abortado sin cambios.';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fan_out_comment' and p.prosrc ilike '%has_client_notification_access%'
  ) then
    raise exception 'notification_rules: fan_out_comment ya fue reemplazada; abortado sin cambios.';
  end if;
end $$;

-- ============================================================
-- 1) NOTIFICATIONS: tipos nuevos, detalle y supresión
-- ============================================================
alter table public.notifications
  add column details jsonb not null default '{}'::jsonb,
  add column suppressed_at timestamptz;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'comment', 'mention', 'reply', 'review_requested', 'approved_by_client', 'approved_by_agency', 'published',
  'discarded', 'rescheduled', 'approval_invalidated', 'created_by_client'
));

-- Pendientes del destinatario (campanita, contador, agenda).
create index if not exists notifications_recipient_pending_idx
  on public.notifications (recipient_id) where read_at is null and suppressed_at is null;

-- Avisos pendientes de publicaciones YA archivadas: fuera de pendientes (no se marcan leídos).
update public.notifications n
set suppressed_at = now()
from public.publications p
where p.id = n.publication_id and p.archived_at is not null and n.read_at is null and n.suppressed_at is null;

-- ============================================================
-- 2) HELPERS (internos)
-- ============================================================
create function public.notification_rank(p_type text)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_type
    when 'approval_invalidated' then 60
    when 'review_requested' then 50
    when 'approved_by_client' then 40
    when 'approved_by_agency' then 40
    when 'published' then 30
    when 'discarded' then 30
    when 'created_by_client' then 20
    when 'rescheduled' then 10
    else 0
  end;
$$;

-- Activo y con acceso vigente al cliente: Client User de ese cliente, Super Admin o Account Manager asignado.
create function public.has_client_notification_access(p_user_id uuid, p_client_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select public.is_active_user(p_user_id) and exists (
    select 1 from public.profiles p
    where p.id = p_user_id
      and (
        (p.role = 'client' and p.client_id = p_client_id)
        or p.role = 'super_admin'
        or (
          p.role = 'account_manager'
          and exists (select 1 from public.user_client_assignments a where a.user_id = p.id and a.client_id = p_client_id)
        )
      )
  );
$$;

-- Una fila por (destinatario, guardado): mayor prioridad gana, `details` acumula; vuelve a no leída solo si cambió.
create function public.upsert_publication_notification(
  p_recipient_id uuid,
  p_client_id uuid,
  p_publication_id uuid,
  p_type text,
  p_details jsonb,
  p_actor_id uuid,
  p_actor_name text,
  p_actor_avatar_url text,
  p_title text,
  p_event_key text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.notifications as n (
    recipient_id, client_id, publication_id, type, details, actor_id, actor_name, actor_avatar_url,
    publication_title, event_key
  ) values (
    p_recipient_id, p_client_id, p_publication_id, p_type, coalesce(p_details, '{}'::jsonb), p_actor_id, p_actor_name,
    p_actor_avatar_url, p_title, p_event_key
  )
  on conflict (recipient_id, event_key) do update set
    type = case when public.notification_rank(excluded.type) > public.notification_rank(n.type) then excluded.type else n.type end,
    details = n.details || excluded.details,
    publication_title = excluded.publication_title,
    read_at = case
      when public.notification_rank(excluded.type) > public.notification_rank(n.type)
        or (n.details || excluded.details) is distinct from n.details then null
      else n.read_at
    end
  where public.notification_rank(excluded.type) > public.notification_rank(n.type)
     or (n.details || excluded.details) is distinct from n.details
     or excluded.publication_title is distinct from n.publication_title;
end;
$$;

-- ============================================================
-- 3) COMENTARIOS: audiencia por rol del autor + participantes + respuesta + mención (una por destinatario)
-- ============================================================
create or replace function public.fan_out_comment(
  p_comment_id uuid,
  p_mentions uuid[],
  p_include_participants boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_comment public.publication_comments%rowtype;
  v_title text;
  v_parent_author uuid;
  v_type text;
  r record;
begin
  select * into v_comment from public.publication_comments where id = p_comment_id;
  if not found then
    return;
  end if;
  if public.notifications_enabled_for(v_comment.client_id) is not true then
    return;
  end if;
  select title into v_title from public.publications where id = v_comment.publication_id;
  if v_comment.reply_to_comment_id is not null then
    select c.author_id into v_parent_author from public.publication_comments c where c.id = v_comment.reply_to_comment_id;
  end if;

  -- Orden por recipient_id: mismo orden de locks que antes (ventanas de email, ver core).
  for r in
    with candidates as (
      select m as user_id, 3 as prio
      from unnest(coalesce(p_mentions, '{}'::uuid[])) as m
      union all
      select v_parent_author, 2 where p_include_participants
      union all
      -- Audiencia por rol del autor: cliente -> equipo asignado; staff -> usuarios cliente.
      select p.id, 1
      from public.profiles p
      where p_include_participants
        and (
          (v_comment.author_role = 'client'
            and p.role in ('super_admin', 'account_manager')
            and exists (select 1 from public.user_client_assignments a where a.user_id = p.id and a.client_id = v_comment.client_id))
          or (v_comment.author_role is distinct from 'client' and p.role = 'client' and p.client_id = v_comment.client_id)
        )
      union all
      -- Participantes previos: autores de comentarios vigentes y quien la envió a revisión por última vez.
      select c.author_id, 1
      from public.publication_comments c
      where p_include_participants and c.publication_id = v_comment.publication_id and c.deleted_at is null
      union all
      select e.actor_id, 1
      from (
        select e2.actor_id
        from public.publication_status_events e2
        join public.statuses s on s.id = e2.to_status_id and s.key = 'in_review'
        where e2.publication_id = v_comment.publication_id and e2.actor_id is not null
        order by e2.created_at desc
        limit 1
      ) e
      where p_include_participants
    ),
    best as (
      select user_id, max(prio) as prio
      from candidates
      where user_id is not null and user_id <> v_comment.author_id
      group by user_id
    )
    select b.user_id, b.prio
    from best b
    where public.has_client_notification_access(b.user_id, v_comment.client_id)
    order by b.user_id
  loop
    v_type := case r.prio when 3 then 'mention' when 2 then 'reply' else 'comment' end;
    insert into public.notifications (
      recipient_id, client_id, publication_id, type, comment_id, actor_id, actor_name, actor_avatar_url,
      publication_title, event_key
    ) values (
      r.user_id, v_comment.client_id, v_comment.publication_id, v_type, v_comment.id, v_comment.author_id,
      v_comment.author_name, v_comment.author_avatar_url, v_title, v_type || ':' || v_comment.id
    ) on conflict (recipient_id, event_key) do nothing;

    -- Emails de colaboración: pausados por v16_collab_emails (la función sale sin encolar).
    perform public.enqueue_comment_digest(
      r.user_id, v_comment.publication_id, v_comment.client_id, v_comment.id, r.prio = 3
    );
  end loop;
end;
$$;

-- ============================================================
-- 4) HISTORIAL DE ESTADOS: sin cambios de auditoría; los avisos pasan a notify_publication_change
-- ============================================================
create or replace function public.log_publication_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_actor_name text;
begin
  if tg_op = 'UPDATE' and new.status_id is not distinct from old.status_id then
    return null;
  end if;

  if v_actor_id is not null then
    select p.role, public.profile_display_name(p.full_name, p.role)
      into v_actor_role, v_actor_name
    from public.profiles p where p.id = v_actor_id;
  end if;

  -- Auditoría: estricta (si falla, falla el cambio de estado — es el registro de aprobación).
  insert into public.publication_status_events (
    publication_id, client_id, from_status_id, to_status_id, actor_id, actor_role, actor_name
  ) values (
    new.id, new.client_id, case when tg_op = 'UPDATE' then old.status_id end, new.status_id,
    v_actor_id, v_actor_role, v_actor_name
  );

  return null;
end;
$$;

-- Sin "of status_id": la invalidación por contenido cambia el estado desde un trigger BEFORE aunque el UPDATE no lo
-- incluya; la función ya sale si el estado no cambió.
drop trigger if exists publications_status_event on public.publications;
create trigger publications_status_event
  after insert or update on public.publications
  for each row execute function public.log_publication_status_change();

-- ============================================================
-- 5) APROBACIÓN DEL CLIENTE SOLO CON VERSIÓN + INVALIDACIÓN POR CONTENIDO (BEFORE)
-- ============================================================
create function public.apply_publication_approval_rules()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_approved uuid;
  v_role text;
begin
  select id into v_approved from public.statuses where key = 'approved';
  if v_approved is null then
    return new;
  end if;
  if auth.uid() is not null then
    select role into v_role from public.profiles where id = auth.uid();
  end if;

  if tg_op = 'INSERT' then
    if new.status_id = v_approved and v_role = 'client' then
      raise exception 'Una publicación nueva no puede crearse Aprobada: enviala a revisión.'
        using errcode = 'P0001', hint = 'v16:approve_with_version';
    end if;
    return new;
  end if;

  -- Archivada: la rechaza publications_archived_readonly.
  if old.archived_at is not null then
    return new;
  end if;

  if new.status_id = v_approved and old.status_id is distinct from v_approved and v_role = 'client'
     and coalesce(current_setting('planner.client_approval', true), '') <> new.id::text then
    raise exception 'Para aprobar, usá «Aprobar publicación»: confirma que aprobás la versión que estás viendo.'
      using errcode = 'P0001', hint = 'v16:approve_with_version';
  end if;

  if old.status_id = v_approved and new.status_id = v_approved and (
    new.title is distinct from old.title
    or new.copy is distinct from old.copy
    or new.drive_folder_url is distinct from old.drive_folder_url
  ) then
    select id into new.status_id from public.statuses where key = 'in_review';
    perform set_config('planner.approval_invalidated', new.id::text, true);
  end if;
  return new;
end;
$$;

create trigger publications_approval_rules
  before insert or update on public.publications
  for each row execute function public.apply_publication_approval_rules();

-- Misma firma, grants y validaciones; habilita su propio UPDATE frente a apply_publication_approval_rules.
create or replace function public.approve_publication_as_client(
  p_publication_id uuid,
  p_expected_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_client_id uuid := public.current_client_id();
  v_role text;
  v_in_review uuid;
  v_approved uuid;
  v_current_status uuid;
  v_current_updated_at timestamptz;
begin
  if v_uid is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role is distinct from 'client' or v_client_id is null or public.is_active_user(v_uid) is not true then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if p_expected_updated_at is null then
    raise exception 'Falta la versión de la publicación.' using errcode = '22023';
  end if;

  select id into v_in_review from public.statuses where key = 'in_review';
  select id into v_approved from public.statuses where key = 'approved';

  perform set_config('planner.client_approval', p_publication_id::text, true);
  update public.publications
  set status_id = v_approved
  where id = p_publication_id
    and client_id = v_client_id
    and status_id = v_in_review
    and updated_at = p_expected_updated_at;

  if not found then
    perform set_config('planner.client_approval', '', true);
    select status_id, updated_at into v_current_status, v_current_updated_at
    from public.publications
    where id = p_publication_id and client_id = v_client_id;

    if v_current_status is null then
      raise exception 'Publicación no encontrada o sin permisos.' using errcode = '42501';
    end if;
    if v_current_status is distinct from v_in_review then
      raise exception 'La publicación ya no está En revisión. Actualizá la publicación para ver su estado actual.'
        using errcode = 'P0001', hint = 'v16:status_changed';
    end if;
    raise exception 'La publicación cambió después de que la abriste. Actualizá la publicación y revisala antes de aprobar.'
      using errcode = 'P0001', hint = 'v16:stale_version';
  end if;
  perform set_config('planner.client_approval', '', true);
end;
$$;

-- ============================================================
-- 6) DESTINOS Y ARCHIVOS: nueva versión de la publicación; si estaba Aprobada, vuelve a En revisión
-- ============================================================
create function public.publication_content_changed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_publication_id uuid := coalesce(new.publication_id, old.publication_id);
  v_status_key text;
  v_archived_at timestamptz;
  v_found boolean;
begin
  -- IFs anidados: plpgsql no corta el AND, y publication_destinations no tiene estas columnas.
  if tg_table_name = 'publication_assets' and tg_op = 'UPDATE' then
    if new.thumbnail_url is not distinct from old.thumbnail_url
       and new.drive_file_url is not distinct from old.drive_file_url
       and new.drive_file_id is not distinct from old.drive_file_id
       and new.sort_order is not distinct from old.sort_order
       and new.is_primary is not distinct from old.is_primary then
      return null;
    end if;
  end if;

  select s.key, p.archived_at, true into v_status_key, v_archived_at, v_found
  from public.publications p join public.statuses s on s.id = p.status_id
  where p.id = v_publication_id;
  -- Borrado en cascada (la publicación ya no existe) o archivada: nada que versionar.
  if v_found is not true or v_archived_at is not null then
    return null;
  end if;

  if v_status_key = 'approved' then
    perform set_config('planner.approval_invalidated', v_publication_id::text, true);
    update public.publications
    set status_id = (select id from public.statuses where key = 'in_review')
    where id = v_publication_id;
  else
    update public.publications set updated_at = now() where id = v_publication_id;
  end if;
  return null;
end;
$$;

create trigger publication_destinations_content_changed
  after insert or delete on public.publication_destinations
  for each row execute function public.publication_content_changed();

create trigger publication_assets_content_changed
  after insert or update or delete on public.publication_assets
  for each row execute function public.publication_content_changed();

-- ============================================================
-- 7) AVISOS DE CAMBIOS DE LA PUBLICACIÓN (AFTER; tolerante a fallas: nunca bloquea un guardado)
-- ============================================================
create function public.notify_publication_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_actor_name text;
  v_actor_avatar text;
  v_is_client boolean;
  v_old_key text;
  v_new_key text;
  v_status_type text;
  v_status_target text;
  v_created boolean := false;
  v_schedule jsonb;
  v_details jsonb := '{}'::jsonb;
  v_header text;
  v_save_key text;
  v_event_key text;
  v_type text;
  r record;
begin
  begin
    -- Archivar: sus avisos pendientes salen de pendientes (sin marcarlos leídos). Restaurar no los reactiva.
    if tg_op = 'UPDATE' and new.archived_at is not null and old.archived_at is null then
      update public.notifications
      set suppressed_at = now()
      where publication_id = new.id and read_at is null and suppressed_at is null;
      return null;
    end if;
    if new.archived_at is not null or (tg_op = 'UPDATE' and old.archived_at is not null) then
      return null;
    end if;
    if public.notifications_enabled_for(new.client_id) is not true then
      return null;
    end if;

    if v_actor is not null then
      select p.role, public.profile_display_name(p.full_name, p.role), p.avatar_url
        into v_actor_role, v_actor_name, v_actor_avatar
      from public.profiles p where p.id = v_actor;
    end if;
    v_is_client := v_actor_role = 'client';

    select key into v_new_key from public.statuses where id = new.status_id;
    if tg_op = 'UPDATE' then
      select key into v_old_key from public.statuses where id = old.status_id;
      if new.publication_date is distinct from old.publication_date
         or new.publication_time is distinct from old.publication_time then
        v_schedule := jsonb_build_object('date', new.publication_date, 'time', to_char(new.publication_time, 'HH24:MI'));
      end if;
    else
      v_created := v_is_client;
    end if;

    if tg_op = 'INSERT' or v_old_key is distinct from v_new_key then
      if tg_op = 'UPDATE' and v_old_key = 'approved' and v_new_key in ('in_review', 'draft') then
        v_status_type := 'approval_invalidated';
        v_status_target := 'all';
        v_details := jsonb_build_object(
          'reason', case
            when current_setting('planner.approval_invalidated', true) = new.id::text
              or new.title is distinct from old.title
              or new.copy is distinct from old.copy
              or new.drive_folder_url is distinct from old.drive_folder_url then 'content'
            else 'status'
          end,
          'status', v_new_key
        );
      elsif v_new_key = 'in_review' then
        v_status_type := 'review_requested';
        v_status_target := case when v_is_client then 'team' else 'clients' end;
      elsif v_new_key = 'approved' then
        v_status_type := case when v_is_client then 'approved_by_client' else 'approved_by_agency' end;
        v_status_target := case when v_is_client then 'team' else 'clients' end;
      elsif v_new_key in ('published', 'discarded') then
        v_status_type := v_new_key;
        v_status_target := 'clients';
      end if;
    end if;

    if v_status_type is null and not v_created and v_schedule is null then
      return null;
    end if;
    if v_schedule is not null then
      v_details := v_details || jsonb_build_object('schedule', v_schedule);
    end if;

    begin
      v_header := nullif(current_setting('request.headers', true), '')::json ->> 'x-planner-save-id';
    exception when others then
      v_header := null;
    end;
    v_save_key := case
      when v_header ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then 'save:' || v_header
      else 'tx:' || txid_current()::text
    end;
    v_event_key := 'pub:' || new.id || ':' || coalesce(v_actor::text, 'system') || ':' || v_save_key;

    for r in
      select p.id,
             (p.role = 'client' and p.client_id = new.client_id) as is_client_user,
             (p.role in ('super_admin', 'account_manager')) as is_team
      from public.profiles p
      where p.id is distinct from v_actor
        and (
          (p.role = 'client' and p.client_id = new.client_id)
          or (
            p.role in ('super_admin', 'account_manager')
            and exists (select 1 from public.user_client_assignments a where a.user_id = p.id and a.client_id = new.client_id)
          )
        )
        and public.is_active_user(p.id)
      order by p.id
    loop
      v_type := null;
      if v_status_type is not null and (
        v_status_target = 'all'
        or (v_status_target = 'clients' and r.is_client_user)
        or (v_status_target = 'team' and r.is_team)
      ) then
        v_type := v_status_type;
      elsif v_created and r.is_team then
        v_type := 'created_by_client';
      elsif v_schedule is not null then
        v_type := 'rescheduled';
      end if;
      continue when v_type is null;

      perform public.upsert_publication_notification(
        r.id, new.client_id, new.id, v_type,
        case when v_type = 'approval_invalidated' then v_details else v_details - 'reason' - 'status' end,
        v_actor, v_actor_name, v_actor_avatar, new.title, v_event_key
      );
    end loop;
  exception when others then
    raise warning 'notify_publication_change: avisos omitidos para %: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

create trigger publications_notify
  after insert or update on public.publications
  for each row execute function public.notify_publication_change();

-- ============================================================
-- 8) LEÍDAS: marcar por publicación con tipos y tope (no marca avisos posteriores a lo visto)
-- ============================================================
create function public.mark_publication_notifications_read(
  p_publication_id uuid,
  p_types text[],
  p_up_to timestamptz
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;
  if p_up_to is null then
    return 0;
  end if;
  update public.notifications
  set read_at = now()
  where recipient_id = auth.uid()
    and publication_id = p_publication_id
    and read_at is null
    and created_at <= p_up_to
    and (p_types is null or type = any (p_types));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ============================================================
-- 9) GRANTS
-- ============================================================
revoke execute on function public.notification_rank(text) from public, anon, authenticated;
revoke execute on function public.has_client_notification_access(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.upsert_publication_notification(uuid, uuid, uuid, text, jsonb, uuid, text, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.notify_publication_change() from public, anon, authenticated;
revoke execute on function public.apply_publication_approval_rules() from public, anon, authenticated;
revoke execute on function public.publication_content_changed() from public, anon, authenticated;
revoke execute on function public.mark_publication_notifications_read(uuid, text[], timestamptz) from public, anon;
grant execute on function public.mark_publication_notifications_read(uuid, text[], timestamptz) to authenticated;
