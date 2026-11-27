-- Rollback de 20261126000004_notification_rules.sql (QA primero; producción solo con autorización).
-- Deja las reglas de notificaciones como en 20261008000001 (core v1.6). PÉRDIDA DE DATOS ACOTADA: se borran las
-- notificaciones de los tipos nuevos (reply, published, discarded, rescheduled, approval_invalidated,
-- created_by_client) y las columnas details / suppressed_at. Comentarios, estados, actividad y publicaciones no se tocan.
-- Antes de revertir la base, publicar en Netlify el deploy anterior de la app (la app nueva usa las columnas nuevas).
begin;

drop trigger if exists publications_notify on public.publications;
drop trigger if exists publications_approval_rules on public.publications;
drop trigger if exists publication_destinations_content_changed on public.publication_destinations;
drop trigger if exists publication_assets_content_changed on public.publication_assets;
drop function if exists public.notify_publication_change();
drop function if exists public.apply_publication_approval_rules();
drop function if exists public.publication_content_changed();
drop function if exists public.mark_publication_notifications_read(uuid, text[], timestamptz);

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
  r record;
begin
  select * into v_comment from public.publication_comments where id = p_comment_id;
  if not found then
    return;
  end if;
  -- Activación de v1.6: con el flag apagado el comentario se guarda igual, pero no notifica ni encola emails.
  if public.notifications_enabled_for(v_comment.client_id) is not true then
    return;
  end if;
  select title into v_title from public.publications where id = v_comment.publication_id;

  for r in
    with mentioned as (
      select distinct m as recipient_id, true as is_mention
      from unnest(coalesce(p_mentions, '{}'::uuid[])) as m
      where m is not null and m <> v_comment.author_id
    ),
    participants as (
      select distinct u as recipient_id, false as is_mention
      from (
        select c.author_id as u
        from public.publication_comments c
        where c.publication_id = v_comment.publication_id and c.deleted_at is null and c.author_id is not null
        union
        select e.actor_id
        from (
          select e2.actor_id
          from public.publication_status_events e2
          join public.statuses s on s.id = e2.to_status_id and s.key = 'in_review'
          where e2.publication_id = v_comment.publication_id and e2.actor_id is not null
          order by e2.created_at desc
          limit 1
        ) e
      ) candidates
      where p_include_participants
        and u <> v_comment.author_id
        and not exists (select 1 from mentioned mm where mm.recipient_id = u)
        and public.is_active_client_member(u, v_comment.client_id)
    )
    select * from mentioned
    union all
    select * from participants
    order by recipient_id
  loop
    insert into public.notifications (
      recipient_id, client_id, publication_id, type, comment_id, actor_id, actor_name, actor_avatar_url,
      publication_title, event_key
    ) values (
      r.recipient_id, v_comment.client_id, v_comment.publication_id,
      case when r.is_mention then 'mention' else 'comment' end,
      v_comment.id, v_comment.author_id, v_comment.author_name, v_comment.author_avatar_url, v_title,
      case when r.is_mention then 'mention:' else 'comment:' end || v_comment.id
    ) on conflict (recipient_id, event_key) do nothing;

    perform public.enqueue_comment_digest(
      r.recipient_id, v_comment.publication_id, v_comment.client_id, v_comment.id, r.is_mention
    );
  end loop;
end;
$$;

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
  v_actor_avatar text;
  v_event_id uuid;
  v_to_key text;
  v_type text;
begin
  -- `update of status_id` dispara aunque el valor no cambie (savePublication siempre lo envía).
  if tg_op = 'UPDATE' and new.status_id is not distinct from old.status_id then
    return null;
  end if;

  if v_actor_id is not null then
    select p.role, public.profile_display_name(p.full_name, p.role), p.avatar_url
      into v_actor_role, v_actor_name, v_actor_avatar
    from public.profiles p where p.id = v_actor_id;
  end if;

  -- Auditoría: estricta (si falla, falla el cambio de estado — es el registro de aprobación).
  insert into public.publication_status_events (
    publication_id, client_id, from_status_id, to_status_id, actor_id, actor_role, actor_name
  ) values (
    new.id, new.client_id, case when tg_op = 'UPDATE' then old.status_id end, new.status_id,
    v_actor_id, v_actor_role, v_actor_name
  ) returning id into v_event_id;

  -- Notificaciones: tolerantes a fallas (nunca bloquean el guardado de v1.5.1 / v1.6).
  begin
    select key into v_to_key from public.statuses where id = new.status_id;

    if v_to_key = 'in_review' then
      v_type := 'review_requested';
    elsif v_to_key = 'approved' then
      v_type := case when v_actor_role = 'client' then 'approved_by_client' else 'approved_by_agency' end;
    end if;

    -- Activación de v1.6: el evento de arriba se registra siempre; las notificaciones solo con el flag activo.
    if v_type is not null and public.notifications_enabled_for(new.client_id) is true then
      insert into public.notifications (
        recipient_id, client_id, publication_id, type, status_event_id, actor_id, actor_name, actor_avatar_url,
        publication_title, event_key
      )
      select p.id, new.client_id, new.id, v_type, v_event_id, v_actor_id, v_actor_name, v_actor_avatar,
             new.title, 'status:' || v_event_id
      from public.profiles p
      where p.id is distinct from v_actor_id
        and (
          -- Revisión y aprobación de la agencia -> Client Users del cliente.
          (v_type in ('review_requested', 'approved_by_agency') and p.role = 'client' and p.client_id = new.client_id)
          -- Aprobación del cliente -> staff asignado.
          or (
            v_type = 'approved_by_client'
            and p.role in ('super_admin', 'account_manager')
            and exists (select 1 from public.user_client_assignments a where a.user_id = p.id and a.client_id = new.client_id)
          )
        )
        and public.is_active_user(p.id)
      on conflict (recipient_id, event_key) do nothing;
    end if;
  exception when others then
    raise warning 'log_publication_status_change: notificaciones omitidas para %: %', new.id, sqlerrm;
  end;

  return null;
end;
$$;

drop trigger if exists publications_status_event on public.publications;
create trigger publications_status_event
  after insert or update of status_id on public.publications
  for each row execute function public.log_publication_status_change();

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

  update public.publications
  set status_id = v_approved
  where id = p_publication_id
    and client_id = v_client_id
    and status_id = v_in_review
    and updated_at = p_expected_updated_at;

  if not found then
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
end;
$$;

drop function if exists public.upsert_publication_notification(uuid, uuid, uuid, text, jsonb, uuid, text, text, text, text);
drop function if exists public.has_client_notification_access(uuid, uuid);
drop function if exists public.notification_rank(text);

delete from public.notifications
where type in ('reply', 'published', 'discarded', 'rescheduled', 'approval_invalidated', 'created_by_client');
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('comment', 'mention', 'review_requested', 'approved_by_client', 'approved_by_agency'));
drop index if exists public.notifications_recipient_pending_idx;
alter table public.notifications drop column suppressed_at, drop column details;

commit;
