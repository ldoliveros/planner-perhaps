-- v1.6 — Pausa los emails de colaboración hasta F5 (worker + cron).
--
-- PREPARADA, NO APLICADA (pending-migrations/v1.6/). Se mueve a supabase/migrations/ y se aplica primero en QA con el
-- guard solo con autorización. Rollback: bloque EM de supabase/rollback/v1.6/rollback_v16.sql.
--
-- Por qué: sin el worker (20261008000003/000004, postergadas) nada procesa `email_outbox`. Con `v16_notifications`
-- encendido, cada comentario, mención, respuesta o edición con menciones encola un resumen (`fan_out_comment` →
-- `enqueue_comment_digest`) y `request_status_email` (ya no la usa la app, pero sigue siendo ejecutable por
-- `authenticated`) encola avisos de estado: filas `pending` que nunca salen ni vencen.
--
-- Qué hace (cambio mínimo y reversible, solo en las DOS funciones que generan emails de colaboración):
--   * Flag nuevo `v16_collab_emails` (misma semántica que `v16_notifications`: `enabled` = todos los clientes,
--     `client_ids` = solo esos), creado APAGADO.
--   * `collab_emails_enabled_for(client)` lee ese flag (sin fila = apagado); interna, sin EXECUTE para usuarios.
--   * `enqueue_comment_digest`: misma firma y mismo cuerpo que en 20261008000001, con una salida temprana si los
--     emails están pausados. `fan_out_comment` sigue creando las notificaciones internas igual.
--   * `request_status_email`: misma firma y mismo cuerpo, con las mismas validaciones; si los emails están pausados
--     devuelve 0 sin encolar ni marcar `email_requested`.
--   `create or replace` conserva dueño y grants (anon/authenticated sin EXECUTE en `enqueue_comment_digest`;
--   `authenticated` con EXECUTE en `request_status_email`): los bloques A/R del rollback no cambian.
-- Qué NO toca: `email_outbox`/`email_outbox_items` (sin triggers), comentarios, respuestas, menciones, reacciones,
-- notificaciones internas, lecturas, aprobaciones, estados, `daily-agenda` (`daily_agenda_log`) ni el aviso de
-- aprobado de v1.5.1 (`publication_client_notifications`). Tablas, RPCs y grants del outbox se conservan para F5.
--
-- Retomar en F5: `update public.planner_feature_flags set enabled = true where key = 'v16_collab_emails';` (o por
-- cliente con `client_ids`), junto con el worker y el cron. Compatibilidad con v1.5.1: no usa estas funciones.

do $$
begin
  if to_regprocedure('public.enqueue_comment_digest(uuid, uuid, uuid, uuid, boolean)') is null
     or to_regprocedure('public.request_status_email(uuid, text, uuid)') is null
     or to_regclass('public.planner_feature_flags') is null then
    raise exception 'v16_pause_collab_emails: faltan migraciones previas de v1.6 (core); abortado sin cambios.';
  end if;
  if to_regprocedure('public.collab_emails_enabled_for(uuid)') is not null
     or exists (select 1 from public.planner_feature_flags where key = 'v16_collab_emails') then
    raise exception 'v16_pause_collab_emails: ya existe el flag o la función de lectura (¿ya se aplicó?); abortado sin cambios.';
  end if;
  -- Las funciones a reemplazar tienen que ser las del core (sin pausa previa y con su inserción en el outbox).
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('enqueue_comment_digest', 'request_status_email')
      and (p.prosrc ilike '%collab_emails_enabled_for%' or p.prosrc not ilike '%insert into public.email_outbox%')
  ) then
    raise exception 'v16_pause_collab_emails: enqueue_comment_digest / request_status_email no son las esperadas; abortado sin cambios.';
  end if;
end $$;

-- 1) Flag, apagado.
insert into public.planner_feature_flags (key, enabled, client_ids, note)
values ('v16_collab_emails', false, '{}', 'Emails de colaboración (resúmenes de comentarios y avisos de estado) pausados hasta F5 (worker + cron).');

-- 2) Lectura del flag (interna: sin EXECUTE para usuarios).
create function public.collab_emails_enabled_for(p_client_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select coalesce(
    (select f.enabled or p_client_id = any (f.client_ids)
     from public.planner_feature_flags f
     where f.key = 'v16_collab_emails'),
    false
  );
$$;
revoke execute on function public.collab_emails_enabled_for(uuid) from public, anon, authenticated;

-- 3) Resumen de comentarios: igual que en 20261008000001 + salida temprana con la pausa.
create or replace function public.enqueue_comment_digest(
  p_recipient_id uuid,
  p_publication_id uuid,
  p_client_id uuid,
  p_comment_id uuid,
  p_is_mention boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_outbox_id uuid;
  v_tries integer := 0;
begin
  -- v1.6 (20261018000001): emails de colaboración pausados hasta F5 (flag `v16_collab_emails` apagado).
  if public.collab_emails_enabled_for(p_client_id) is not true then
    return;
  end if;

  loop
    v_tries := v_tries + 1;

    select id into v_outbox_id
    from public.email_outbox
    where kind = 'comment_digest'
      and recipient_id = p_recipient_id
      and publication_id = p_publication_id
      and status = 'pending'
    for update;

    exit when v_outbox_id is not null;

    begin
      insert into public.email_outbox (kind, recipient_id, publication_id, client_id, send_after)
      values ('comment_digest', p_recipient_id, p_publication_id, p_client_id, now() + interval '15 minutes')
      returning id into v_outbox_id;
      exit;
    exception when unique_violation then
      -- Otra transacción abrió la ventana en paralelo: volver a tomarla con FOR UPDATE.
      if v_tries >= 5 then
        raise;
      end if;
    end;
  end loop;

  insert into public.email_outbox_items (outbox_id, comment_id, is_mention)
  values (v_outbox_id, p_comment_id, p_is_mention)
  on conflict (outbox_id, comment_id)
    do update set is_mention = public.email_outbox_items.is_mention or excluded.is_mention;
end;
$$;

-- 4) Aviso de estado pedido por la API: igual que en 20261008000001 + devuelve 0 con la pausa.
create or replace function public.request_status_email(
  p_publication_id uuid,
  p_status_key text,
  p_request_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_client_id uuid;
  v_current_key text;
  v_event_id uuid;
  v_kind text;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;
  if p_status_key not in ('in_review', 'approved') or p_request_id is null then
    raise exception 'Pedido de email inválido.' using errcode = '22023';
  end if;

  select p.client_id, s.key into v_client_id, v_current_key
  from public.publications p join public.statuses s on s.id = p.status_id
  where p.id = p_publication_id;

  if v_client_id is null or public.can_manage_client(v_client_id) is not true then
    raise exception 'Publicación no encontrada o sin permisos.' using errcode = '42501';
  end if;
  if v_current_key is distinct from p_status_key then
    raise exception 'El estado de la publicación cambió; no se envió el email.' using errcode = 'P0001';
  end if;
  if public.notifications_enabled_for(v_client_id) is not true then
    raise exception 'Los avisos por email de v1.6 todavía no están activos. El cambio de estado sí se guardó.'
      using errcode = 'P0001', hint = 'v16:notifications_disabled';
  end if;
  -- v1.6 (20261018000001): emails de colaboración pausados hasta F5: no se encola ni se marca el pedido.
  if public.collab_emails_enabled_for(v_client_id) is not true then
    return 0;
  end if;

  select e.id into v_event_id
  from public.publication_status_events e
  join public.statuses s on s.id = e.to_status_id and s.key = p_status_key
  where e.publication_id = p_publication_id
  order by e.created_at desc
  limit 1;

  if v_event_id is not null then
    update public.publication_status_events set email_requested = true where id = v_event_id;
  end if;

  v_kind := case when p_status_key = 'in_review' then 'review_requested' else 'approved_client' end;

  insert into public.email_outbox (
    kind, recipient_id, publication_id, client_id, send_after, source_event_id, request_id, created_by
  )
  select v_kind, p.id, p_publication_id, v_client_id, now(), v_event_id, p_request_id, v_uid
  from public.profiles p
  where p.role = 'client' and p.client_id = v_client_id and public.is_active_user(p.id)
  on conflict (request_id, recipient_id) where request_id is not null do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
