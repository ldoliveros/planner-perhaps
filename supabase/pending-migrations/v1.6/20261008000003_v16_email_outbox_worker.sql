-- v1.6 — F5: RPCs del worker de emails (Edge Function `email-outbox`). Solo service_role.
--
-- PREPARADA, NO APLICADA. Fuera de supabase/migrations/ hasta autorización explícita.
-- Requiere 20261008000001_v16_collab_core.sql aplicada.
--
-- Flujo del worker por corrida (cron cada 15 min + disparo inmediato desde la app tras encolar avisos
-- de revisión/aprobación):
--   1) claim_email_outbox(limit)  -> reclama filas vencidas (pending/retry con send_after <= now(), o
--      processing colgadas) con FOR UPDATE SKIP LOCKED: dos corridas concurrentes (cron + disparo
--      inmediato) nunca toman la misma fila. Revalida permisos del destinatario y descarta (skipped)
--      las que ya no corresponden. Devuelve el payload listo para renderizar.
--   2) freeze_email_outbox_render(id, subject, html) -> solo si rendered_html es null; devuelve el
--      contenido congelado (el que hay que enviar).
--   3) POST Resend con `Idempotency-Key: planner-outbox-<id>` (misma key en todos los reintentos; Resend
--      la retiene 24 h y el contenido congelado garantiza el mismo payload).
--   4) complete_email_outbox(id, resend_id) | fail_email_outbox(id, error, permanent) | skip_email_outbox.
--
-- Timing con cron cada 15 min: digest entre 15 y 30 min después del primer comentario de la ventana.
-- Reintentos: 5 / 15 / 45 / 120 min (efectivamente redondeados al siguiente tick), máx. 5 intentos —
-- todo dentro de las 24 h de retención de la Idempotency-Key. Filas no enviadas tras 24 h -> 'expired'
-- (quedan registradas con su historial de intentos; nunca se borran).

create or replace function public.claim_email_outbox(
  p_limit integer default 25,
  p_stale interval default interval '10 minutes'
)
returns setof jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.email_outbox%rowtype;
  v_email text;
  v_name text;
  v_role text;
  v_items jsonb;
  v_pub record;
begin
  -- Vencidas: nunca enviar algo con más de 24 h de atraso (incluye lo encolado antes de activar F5).
  -- Se marcan 'expired' (auditables), no se eliminan.
  update public.email_outbox
  set status = 'expired', skip_reason = 'not_sent_within_24h', locked_at = null
  where status in ('pending', 'retry') and send_after < now() - interval '24 hours';

  -- Colgadas sin intentos restantes.
  update public.email_outbox
  set status = 'failed', locked_at = null, last_error = coalesce(last_error || ' | ', '') || 'stale processing'
  where status = 'processing' and locked_at < now() - p_stale and attempts >= max_attempts;

  for r in
    update public.email_outbox o
    set status = 'processing', locked_at = now(), attempts = o.attempts + 1
    where o.id in (
      select d.id from public.email_outbox d
      where (d.status in ('pending', 'retry') and d.send_after <= now())
         or (d.status = 'processing' and d.locked_at < now() - p_stale)
      order by d.send_after
      limit greatest(1, least(p_limit, 100))
      for update skip locked
    )
    returning o.*
  loop
    -- Activación de v1.6 apagada (p. ej. rollback) después de encolar: no se envía, queda registrado.
    if public.notifications_enabled_for(r.client_id) is not true then
      update public.email_outbox set status = 'skipped', skip_reason = 'notifications_disabled', locked_at = null
      where id = r.id;
      continue;
    end if;

    -- Revalidación de permisos al momento de enviar.
    if public.is_active_client_member(r.recipient_id, r.client_id) is not true then
      update public.email_outbox set status = 'skipped', skip_reason = 'recipient_without_access', locked_at = null
      where id = r.id;
      continue;
    end if;

    select u.email, public.profile_display_name(p.full_name, p.role), p.role
      into v_email, v_name, v_role
    from public.profiles p join auth.users u on u.id = p.id
    where p.id = r.recipient_id;

    -- Avisos de revisión/aprobación: solo Client Users.
    if v_email is null or (r.kind in ('review_requested', 'approved_client') and v_role is distinct from 'client') then
      update public.email_outbox set status = 'skipped', skip_reason = 'recipient_not_eligible', locked_at = null
      where id = r.id;
      continue;
    end if;

    select pb.id, pb.title, pb.publication_date, pb.publication_time, c.name as client_name
      into v_pub
    from public.publications pb join public.clients c on c.id = pb.client_id
    where pb.id = r.publication_id;

    v_items := null;
    if r.kind = 'comment_digest' then
      select jsonb_agg(
               jsonb_build_object(
                 'comment_id', c.id,
                 'author_name', c.author_name,
                 'author_role', c.author_role,
                 'body', c.body,
                 'is_mention', i.is_mention,
                 'edited', c.edited_at is not null,
                 'created_at', c.created_at
               ) order by c.created_at
             )
        into v_items
      from public.email_outbox_items i
      join public.publication_comments c on c.id = i.comment_id
      where i.outbox_id = r.id
        and c.deleted_at is null
        and c.author_id is distinct from r.recipient_id;

      -- Sin ítems vigentes (todos eliminados) y todavía no renderizado -> no hay nada que enviar.
      if v_items is null and r.rendered_html is null then
        update public.email_outbox set status = 'skipped', skip_reason = 'no_items', locked_at = null
        where id = r.id;
        continue;
      end if;
    end if;

    return next jsonb_build_object(
      'id', r.id,
      'kind', r.kind,
      'attempts', r.attempts,
      'recipient_email', v_email,
      'recipient_name', v_name,
      'publication_id', r.publication_id,
      'publication_title', v_pub.title,
      'publication_date', v_pub.publication_date,
      'publication_time', v_pub.publication_time,
      'client_name', v_pub.client_name,
      'rendered_subject', r.rendered_subject,
      'rendered_html', r.rendered_html,
      'items', coalesce(v_items, '[]'::jsonb)
    );
  end loop;
end;
$$;

-- Congela el contenido en el primer intento y devuelve SIEMPRE el congelado.
create or replace function public.freeze_email_outbox_render(p_id uuid, p_subject text, p_html text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_subject text;
  v_html text;
begin
  update public.email_outbox
  set rendered_subject = p_subject, rendered_html = p_html
  where id = p_id and status = 'processing' and rendered_html is null;

  select rendered_subject, rendered_html into v_subject, v_html from public.email_outbox where id = p_id;
  return jsonb_build_object('subject', v_subject, 'html', v_html);
end;
$$;

-- Log de compatibilidad: los avisos de aprobado siguen quedando en publication_client_notifications
-- (lo lee getLastPublicationNotification / "Último aviso" desde v1.5).
create or replace function public.log_outbox_client_notification(p_id uuid, p_status text, p_resend_id text, p_error text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.publication_client_notifications (
    publication_id, recipient_user_id, recipient_email, status, resend_email_id, error_message, created_by
  )
  select o.publication_id, o.recipient_id, u.email, p_status, p_resend_id, left(p_error, 500), o.created_by
  from public.email_outbox o
  join auth.users u on u.id = o.recipient_id
  where o.id = p_id and o.kind = 'approved_client' and u.email is not null;
end;
$$;

create or replace function public.complete_email_outbox(p_id uuid, p_resend_email_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.email_outbox
  set status = 'sent', sent_at = now(), resend_email_id = p_resend_email_id, locked_at = null, last_error = null
  where id = p_id and status = 'processing';

  if found then
    perform public.log_outbox_client_notification(p_id, 'sent', p_resend_email_id, null);
  end if;
end;
$$;

create or replace function public.fail_email_outbox(p_id uuid, p_error text, p_permanent boolean default false)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  update public.email_outbox
  set status = case when p_permanent or attempts >= max_attempts then 'failed' else 'retry' end,
      send_after = case
        when p_permanent or attempts >= max_attempts then send_after
        else now() + make_interval(mins => (array[5, 15, 45, 120])[least(greatest(attempts, 1), 4)])
      end,
      last_error = left(p_error, 1000),
      locked_at = null
  where id = p_id and status = 'processing'
  returning status into v_status;

  if v_status = 'failed' then
    perform public.log_outbox_client_notification(p_id, 'failed', null, p_error);
  end if;
end;
$$;

create or replace function public.skip_email_outbox(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.email_outbox
  set status = 'skipped', skip_reason = left(p_reason, 200), locked_at = null
  where id = p_id and status = 'processing';
end;
$$;

-- EXECUTE exclusivamente service_role (la Edge Function). Nada para anon/authenticated.
revoke execute on function public.claim_email_outbox(integer, interval) from public, anon, authenticated;
revoke execute on function public.freeze_email_outbox_render(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.log_outbox_client_notification(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.complete_email_outbox(uuid, text) from public, anon, authenticated;
revoke execute on function public.fail_email_outbox(uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.skip_email_outbox(uuid, text) from public, anon, authenticated;

grant execute on function public.claim_email_outbox(integer, interval) to service_role;
grant execute on function public.freeze_email_outbox_render(uuid, text, text) to service_role;
grant execute on function public.complete_email_outbox(uuid, text) to service_role;
grant execute on function public.fail_email_outbox(uuid, text, boolean) to service_role;
grant execute on function public.skip_email_outbox(uuid, text) to service_role;
