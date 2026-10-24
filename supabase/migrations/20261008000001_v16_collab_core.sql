-- v1.6 — Colaboración: historial de estados, comentarios, menciones, notificaciones internas y cola
-- persistente de emails (outbox). F1 del diseño técnico de v1.6.
--
-- ESTRICTAMENTE ADITIVA. Compatible con v1.5.1 corriendo contra la misma base:
--   * No altera ni borra columnas, tablas, policies, grants ni datos existentes.
--   * Único punto de contacto con el flujo actual: el trigger AFTER `publications_status_event` sobre
--     publications. Es AFTER (no puede modificar la fila), solo inserta en tablas nuevas, y la parte de
--     notificaciones corre en un sub-bloque con EXCEPTION -> WARNING: un error de notificaciones nunca
--     bloquea un guardado/cambio de estado de v1.5.1. El INSERT del evento de auditoría sí es estricto.
--   * El Client User NO gana ningún permiso de escritura directo: aprobar/comentar pasa por RPCs
--     security definer que validan todo y tocan solo lo indispensable (status_id / tablas nuevas).
--   * Las RPCs de emails solo ENCOLAN en email_outbox: nada se envía hasta que exista el worker (F5,
--     Edge Function + supabase/pending-migrations/v1.6/20261008000003 y 000004). El worker descarta
--     filas vencidas (>24 h), así que lo encolado antes de F5 no sale tarde.
--   * Realtime NO se habilita acá: va en pending-migrations/v1.6/20261008000002 (paso aparte).
--   * NOTIFICACIONES APAGADAS POR DEFECTO: el flag `v16_notifications` (tabla planner_feature_flags) nace en
--     false. Mientras siga así, ni el trigger ni las RPCs crean notificaciones internas ni encolan emails: con
--     v1.5.1 en producción no se acumula nada. El historial de estados (publication_status_events) se registra
--     SIEMPRE, con o sin flag — no depende de la activación. Para QA se habilita solo para clientes puntuales
--     (client_ids = QA Sandbox); en el lanzamiento, enabled = true. Ver pending-migrations/v1.6/README.md.
--
-- Grants: en este proyecto las tablas nuevas NO quedan accesibles sin GRANT explícito (ver
-- 20260918000001_campaigns.sql y 20260924000003_daily_agenda_grants_fix.sql). Además PostgreSQL da
-- EXECUTE a PUBLIC sobre funciones nuevas por defecto: cada función revoca de public/anon/authenticated
-- y re-otorga solo lo necesario (mismo criterio que 20260916000002_security_advisor_hardening.sql).
--
-- Rollback: supabase/rollback/v1.6/20261008000001_v16_collab_core_down.sql (NO está en migrations/).

-- ============================================================
-- PRE-FLIGHT — abortar si algún objeto de v1.6 ya existe en la base compartida.
-- Las tablas se crean SIN "if not exists" y las funciones nuevas con "create or replace": si ya hubiera un
-- objeto con el mismo nombre (creado a mano desde el Dashboard, por ejemplo una tabla `notifications`), la
-- migración podría reutilizarlo o pisarlo en silencio. Este bloque lo detecta antes de tocar nada y la
-- transacción entera se revierte.
-- ============================================================
do $$
declare
  v_found text;
begin
  select string_agg(format('tabla %s', c.relname), ', ') into v_found
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')
    and c.relname in ('publication_status_events', 'publication_comments', 'publication_comment_mentions',
                      'publication_comment_revisions', 'notifications', 'email_outbox', 'email_outbox_items',
                      'planner_feature_flags');
  if v_found is not null then
    raise exception 'v16_collab_core: ya existen objetos con nombres de v1.6 (%); abortado sin cambios.', v_found;
  end if;

  select string_agg(format('función %s', p.proname), ', ') into v_found
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('is_active_user', 'is_active_client_member', 'profile_display_name', 'list_mentionable_members',
                      'enqueue_comment_digest', 'fan_out_comment', 'sanitize_mentions', 'log_publication_status_change',
                      'add_publication_comment', 'edit_publication_comment', 'delete_publication_comment',
                      'approve_publication_as_client', 'request_status_email', 'mark_notifications_read',
                      'mark_publication_notifications_read', 'notifications_enabled_for');
  if v_found is not null then
    raise exception 'v16_collab_core: ya existen funciones con nombres de v1.6 (%); abortado sin cambios.', v_found;
  end if;

  if exists (select 1 from pg_trigger where tgname = 'publications_status_event' and not tgisinternal) then
    raise exception 'v16_collab_core: ya existe el trigger publications_status_event; abortado sin cambios.';
  end if;
end $$;

-- ============================================================
-- 0) HELPERS (security definer, internos salvo list_mentionable_members)
-- ============================================================

-- Usuario activo en Auth: confirmó email, no está baneado (Desactivado) ni borrado. Misma regla que
-- deriveUserAccessStatus (lib/user-access.ts), pero en SQL: sin el tope de listUsers({ perPage: 200 }).
create or replace function public.is_active_user(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from auth.users u
    where u.id = p_user_id
      and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until <= now())
      and u.deleted_at is null
  );
$$;

-- Miembro activo de un cliente: Client User de ese cliente, o staff (Account Manager / Super Admin)
-- ASIGNADO a ese cliente. Misma regla de participación que listClientMembers (lib/supabase/queries.ts).
-- Un Super Admin no asignado puede comentar (can_view_client) pero NO es miembro: no es mencionable ni
-- destinatario automático.
create or replace function public.is_active_client_member(p_user_id uuid, p_client_id uuid)
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
        or (
          p.role in ('super_admin', 'account_manager')
          and exists (
            select 1 from public.user_client_assignments a
            where a.user_id = p.id and a.client_id = p_client_id
          )
        )
      )
  );
$$;

-- Nombre visible para snapshots (comentarios / notificaciones). Nunca expone el email (un Client User
-- no debe ver emails del staff): sin full_name cae a una etiqueta genérica por rol.
create or replace function public.profile_display_name(p_full_name text, p_role text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(
    nullif(btrim(p_full_name), ''),
    case when p_role = 'client' then 'Cliente' else 'Equipo Perhaps' end
  );
$$;

-- Usuarios mencionables (y candidatos de destinatarios) de un cliente. Única función de este bloque
-- expuesta a `authenticated`: alimenta el selector @ (nombre + avatar, SIN email).
create or replace function public.list_mentionable_members(p_client_id uuid)
returns table (user_id uuid, full_name text, avatar_url text, role text)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select p.id, public.profile_display_name(p.full_name, p.role), p.avatar_url, p.role
  from public.profiles p
  where public.can_view_client(p_client_id)
    and p.id <> auth.uid()
    and (
      p.client_id = p_client_id
      or p.id in (select a.user_id from public.user_client_assignments a where a.client_id = p_client_id)
    )
    and public.is_active_client_member(p.id, p_client_id)
  order by 2;
$$;

-- ============================================================
-- 0b) ACTIVACIÓN — flags de v1.6 (deny-all; se cambian solo desde el SQL Editor / service_role)
-- ============================================================
create table public.planner_feature_flags (
  key text primary key,
  -- true = activo para todos los clientes (lanzamiento).
  enabled boolean not null default false,
  -- Activo SOLO para estos clientes aunque enabled = false (QA: QA Sandbox).
  client_ids uuid[] not null default '{}',
  note text,
  updated_at timestamptz not null default now()
);

create trigger planner_feature_flags_set_updated_at before update on public.planner_feature_flags
  for each row execute function public.set_updated_at();

insert into public.planner_feature_flags (key, enabled, note)
values (
  'v16_notifications',
  false,
  'Notificaciones internas y emails automáticos de v1.6. false hasta el lanzamiento: con v1.5.1 activa no se generan.'
);

-- ¿Las notificaciones automáticas de v1.6 están activas para este cliente? Sin fila o con error de datos: false
-- (fail-closed: ante la duda, no notificar).
create or replace function public.notifications_enabled_for(p_client_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select coalesce(
    (select f.enabled or p_client_id = any (f.client_ids)
     from public.planner_feature_flags f
     where f.key = 'v16_notifications'),
    false
  );
$$;

-- ============================================================
-- 1) PUBLICATION_STATUS_EVENTS — historial de estados (incluye quién aprobó, rol y fecha)
-- ============================================================
create table public.publication_status_events (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.publications (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  from_status_id uuid references public.statuses (id),
  to_status_id uuid not null references public.statuses (id),
  -- null cuando el cambio no vino de un usuario (service_role / SQL manual).
  actor_id uuid references public.profiles (id) on delete set null,
  actor_role text,
  actor_name text,
  -- true si alguien pidió el email asociado (envío a revisión / aviso de aprobado).
  email_requested boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists publication_status_events_publication_idx
  on public.publication_status_events (publication_id, created_at desc);

-- ============================================================
-- 2) COMENTARIOS
-- ============================================================
create table public.publication_comments (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.publications (id) on delete cascade,
  -- Derivado SIEMPRE en la RPC desde publications.client_id, nunca del cliente web.
  client_id uuid not null references public.clients (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  -- Snapshots: un Client User no puede leer profiles del staff (profiles_select_own).
  author_name text not null,
  author_avatar_url text,
  author_role text not null,
  body text not null,
  -- Idempotencia de reintentos del cliente web (doble click / reconexión).
  request_id uuid not null,
  edited_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint publication_comments_body_length check (char_length(body) <= 5000),
  -- Un comentario eliminado nunca conserva texto legible por la API (el original vive en revisions).
  constraint publication_comments_deleted_body_empty check (deleted_at is null or body = ''),
  constraint publication_comments_author_request_uniq unique (author_id, request_id)
);
create index if not exists publication_comments_publication_idx
  on public.publication_comments (publication_id, created_at desc);
create index if not exists publication_comments_author_idx on public.publication_comments (author_id);

create or replace trigger publication_comments_set_updated_at before update on public.publication_comments
  for each row execute function public.set_updated_at();

create table public.publication_comment_mentions (
  comment_id uuid not null references public.publication_comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
create index if not exists publication_comment_mentions_user_idx on public.publication_comment_mentions (user_id);

-- Auditoría interna (deny-all): texto previo de cada edición y texto de cada eliminación. Sin FK a
-- comments/publications a propósito: la auditoría sobrevive aunque se elimine la publicación.
create table public.publication_comment_revisions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null,
  publication_id uuid not null,
  client_id uuid not null,
  action text not null check (action in ('edit', 'delete')),
  previous_body text not null,
  actor_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists publication_comment_revisions_comment_idx
  on public.publication_comment_revisions (comment_id, created_at);

-- ============================================================
-- 3) NOTIFICATIONS — bandeja interna (campanita)
-- ============================================================
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  publication_id uuid references public.publications (id) on delete cascade,
  type text not null check (type in ('comment', 'mention', 'review_requested', 'approved_by_client', 'approved_by_agency')),
  -- Sin extracto del comentario a propósito: la UI hace join a publication_comments, así un comentario
  -- eliminado no deja su texto en la bandeja de nadie.
  comment_id uuid references public.publication_comments (id) on delete cascade,
  status_event_id uuid references public.publication_status_events (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_name text,
  actor_avatar_url text,
  publication_title text,
  -- 'comment:<id>' | 'mention:<id>' | 'status:<event_id>' — dedupe duro por destinatario.
  event_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_recipient_event_uniq unique (recipient_id, event_key)
);
-- Cursor compuesto de la bandeja (created_at DESC, id DESC): ver listNotifications.
create index if not exists notifications_recipient_created_idx on public.notifications (recipient_id, created_at desc, id desc);
create index if not exists notifications_recipient_unread_idx on public.notifications (recipient_id) where read_at is null;
create index if not exists notifications_publication_idx on public.notifications (publication_id);

-- ============================================================
-- 4) EMAIL OUTBOX — cola persistente (deny-all, la procesa el worker de F5 vía RPCs)
--
-- Estados: pending (ventana abierta / listo para enviar) -> processing (reclamado por el worker)
--          -> sent | retry (falla transitoria, vuelve a la cola) | failed (definitiva) | expired (no se
--          pudo enviar dentro de 24 h: queda registrada, nunca se borra) | skipped
--          (destinatario sin acceso o sin ítems vigentes) | cancelled (manual).
--
-- Ventanas de comentarios (comment_digest): UNA fila 'pending' por destinatario + publicación (índice
-- único parcial). send_after = primer evento + 15 min, fija (no se desliza). Con el cron cada 15 min,
-- el email sale entre 15 y 30 min después del primer comentario de la ventana.
--
-- Concurrencia pending vs processing (ver enqueue_comment_digest y claim_email_outbox):
--   * El encolado toma la fila pendiente con SELECT ... FOR UPDATE y agrega el ítem en la misma
--     transacción que el comentario.
--   * El worker la reclama con UPDATE ... FOR UPDATE SKIP LOCKED (pending -> processing).
--   * Si el worker reclama primero, el SELECT FOR UPDATE del encolado espera, re-evalúa
--     status = 'pending' (ya no coincide) y abre una ventana NUEVA: un comentario nunca se agrega a una
--     ventana que ya se está enviando. Si el encolado bloquea primero, el worker la saltea en esa
--     corrida y la toma en la siguiente (máx. +15 min, solo en esa colisión de milisegundos).
--   * Los reintentos usan el estado 'retry' (no 'pending'), así nunca chocan con el índice único
--     de la ventana abierta siguiente.
-- ============================================================
create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('comment_digest', 'review_requested', 'approved_client')),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  publication_id uuid not null references public.publications (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'retry', 'sent', 'failed', 'skipped', 'expired', 'cancelled')),
  send_after timestamptz not null,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  locked_at timestamptz,
  last_error text,
  skip_reason text,
  -- Congelado en el primer intento: los reintentos reenvían EXACTAMENTE el mismo contenido con la misma
  -- Idempotency-Key (Resend responde 409 si se reutiliza una key con otro payload).
  rendered_subject text,
  rendered_html text,
  resend_email_id text,
  sent_at timestamptz,
  -- review_requested / approved_client: evento que originó el aviso + intención del usuario (un click =
  -- un request_id). Dedupe por (request_id, recipient_id).
  source_event_id uuid references public.publication_status_events (id) on delete set null,
  request_id uuid,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists email_outbox_open_digest_uidx
  on public.email_outbox (recipient_id, publication_id)
  where kind = 'comment_digest' and status = 'pending';
create unique index if not exists email_outbox_request_recipient_uidx
  on public.email_outbox (request_id, recipient_id)
  where request_id is not null;
create index if not exists email_outbox_due_idx on public.email_outbox (send_after)
  where status in ('pending', 'retry');
create index if not exists email_outbox_processing_idx on public.email_outbox (locked_at)
  where status = 'processing';

create or replace trigger email_outbox_set_updated_at before update on public.email_outbox
  for each row execute function public.set_updated_at();

create table public.email_outbox_items (
  outbox_id uuid not null references public.email_outbox (id) on delete cascade,
  comment_id uuid not null references public.publication_comments (id) on delete cascade,
  is_mention boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (outbox_id, comment_id)
);
create index if not exists email_outbox_items_comment_idx on public.email_outbox_items (comment_id);

-- ============================================================
-- 5) ENCOLADO Y DISTRIBUCIÓN (internas: sin EXECUTE para anon/authenticated)
-- ============================================================

-- Agrega un comentario a la ventana abierta del destinatario para esa publicación (o abre una nueva).
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

-- Notificaciones + emails de un comentario.
--   p_mentions: menciones a notificar (ya validadas: miembros activos, sin el autor).
--   p_include_participants: true en un comentario nuevo; false en una edición (solo menciones nuevas).
-- Participantes = autores de comentarios no eliminados de la publicación + quien la envió a revisión
-- por última vez; todos filtrados por is_active_client_member y sin el autor del evento.
-- Mencionado y participante a la vez -> recibe solo la mención (una notificación, un ítem de email).
--
-- Deadlocks: los destinatarios se recorren en UN solo loop ordenado por recipient_id. Dos comentarios
-- concurrentes en la misma publicación toman los FOR UPDATE de las ventanas de email siempre en el mismo
-- orden, así nunca quedan esperándose mutuamente.
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

-- Menciones válidas: deduplicadas, sin el autor, solo miembros activos del cliente.
create or replace function public.sanitize_mentions(p_mentions uuid[], p_author_id uuid, p_client_id uuid)
returns uuid[]
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select coalesce(array_agg(distinct m), '{}')
  from unnest(coalesce(p_mentions, '{}'::uuid[])) as m
  where m is not null
    and m <> p_author_id
    and public.is_active_client_member(m, p_client_id);
$$;

-- ============================================================
-- 6) TRIGGER — historial de estados + notificaciones internas de revisión/aprobación
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

-- ============================================================
-- 7) RPCs PARA LA APP (EXECUTE solo authenticated)
-- ============================================================

-- Comentar. Idempotente por (autor, request_id). Bloquea la publicación FOR SHARE: serializa contra un
-- cambio de estado concurrente (no se puede comentar en la misma ventana en que otro la aprueba).
create or replace function public.add_publication_comment(
  p_publication_id uuid,
  p_body text,
  p_mentions uuid[] default '{}',
  p_request_id uuid default null
)
returns public.publication_comments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_request_id uuid := coalesce(p_request_id, gen_random_uuid());
  v_body text := btrim(coalesce(p_body, ''));
  v_client_id uuid;
  v_status_key text;
  v_role text;
  v_full_name text;
  v_avatar text;
  v_mentions uuid[];
  v_comment public.publication_comments%rowtype;
begin
  if v_uid is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;

  select * into v_comment from public.publication_comments where author_id = v_uid and request_id = v_request_id;
  if found then
    return v_comment;
  end if;

  select p.client_id, s.key into v_client_id, v_status_key
  from public.publications p
  join public.statuses s on s.id = p.status_id
  where p.id = p_publication_id
  for share of p;

  -- IS NOT TRUE (no NOT): can_view_client() devuelve NULL para staff sin asignación a ese cliente
  -- (current_client_id() = target -> NULL) y un IF sobre NULL no rechaza. NULL = sin acceso.
  if v_client_id is null or public.can_view_client(v_client_id) is not true or public.is_active_user(v_uid) is not true then
    raise exception 'Publicación no encontrada o sin permisos.' using errcode = '42501';
  end if;
  if v_status_key is distinct from 'in_review' then
    raise exception 'Los comentarios solo están habilitados cuando la publicación está En revisión.' using errcode = 'P0001';
  end if;
  if char_length(v_body) = 0 or char_length(v_body) > 5000 then
    raise exception 'El comentario debe tener entre 1 y 5000 caracteres.' using errcode = '22023';
  end if;

  select role, full_name, avatar_url into v_role, v_full_name, v_avatar from public.profiles where id = v_uid;
  v_mentions := public.sanitize_mentions(p_mentions, v_uid, v_client_id);

  begin
    insert into public.publication_comments (
      publication_id, client_id, author_id, author_name, author_avatar_url, author_role, body, request_id
    ) values (
      p_publication_id, v_client_id, v_uid, public.profile_display_name(v_full_name, v_role), v_avatar, v_role,
      v_body, v_request_id
    ) returning * into v_comment;
  exception when unique_violation then
    -- Reintento concurrente con el mismo request_id: devolver el que ganó.
    select * into v_comment from public.publication_comments where author_id = v_uid and request_id = v_request_id;
    return v_comment;
  end;

  insert into public.publication_comment_mentions (comment_id, user_id)
  select v_comment.id, unnest(v_mentions);

  perform public.fan_out_comment(v_comment.id, v_mentions, true);
  return v_comment;
end;
$$;

-- Editar comentario propio (solo En revisión). Guarda el texto previo en auditoría y notifica SOLO a
-- las menciones agregadas en esta edición.
create or replace function public.edit_publication_comment(
  p_comment_id uuid,
  p_body text,
  p_mentions uuid[] default '{}'
)
returns public.publication_comments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_comment public.publication_comments%rowtype;
  v_status_key text;
  v_new_mentions uuid[];
  v_added uuid[];
begin
  if v_uid is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;

  select * into v_comment from public.publication_comments where id = p_comment_id for update;
  -- IS NOT TRUE: ver add_publication_comment (NULL de can_view_client = sin acceso).
  if not found or v_comment.author_id is distinct from v_uid or public.can_view_client(v_comment.client_id) is not true then
    raise exception 'Comentario no encontrado o sin permisos.' using errcode = '42501';
  end if;
  if v_comment.deleted_at is not null then
    raise exception 'El comentario fue eliminado.' using errcode = 'P0001';
  end if;

  select s.key into v_status_key
  from public.publications p join public.statuses s on s.id = p.status_id
  where p.id = v_comment.publication_id
  for share of p;
  if v_status_key is distinct from 'in_review' then
    raise exception 'Los comentarios solo se pueden editar cuando la publicación está En revisión.' using errcode = 'P0001';
  end if;
  if char_length(v_body) = 0 or char_length(v_body) > 5000 then
    raise exception 'El comentario debe tener entre 1 y 5000 caracteres.' using errcode = '22023';
  end if;

  if v_body = v_comment.body then
    return v_comment;
  end if;

  insert into public.publication_comment_revisions (comment_id, publication_id, client_id, action, previous_body, actor_id)
  values (v_comment.id, v_comment.publication_id, v_comment.client_id, 'edit', v_comment.body, v_uid);

  v_new_mentions := public.sanitize_mentions(p_mentions, v_uid, v_comment.client_id);
  select coalesce(array_agg(m), '{}') into v_added
  from unnest(v_new_mentions) as m
  where not exists (select 1 from public.publication_comment_mentions cm where cm.comment_id = v_comment.id and cm.user_id = m);

  delete from public.publication_comment_mentions
  where comment_id = v_comment.id and not (user_id = any (v_new_mentions));
  insert into public.publication_comment_mentions (comment_id, user_id)
  select v_comment.id, unnest(v_added)
  on conflict do nothing;

  update public.publication_comments
  set body = v_body, edited_at = now()
  where id = v_comment.id
  returning * into v_comment;

  if array_length(v_added, 1) > 0 then
    perform public.fan_out_comment(v_comment.id, v_added, false);
  end if;
  return v_comment;
end;
$$;

-- Eliminar comentario propio (solo En revisión): soft delete, texto a auditoría, saca el comentario de
-- ventanas de email todavía no enviadas.
create or replace function public.delete_publication_comment(p_comment_id uuid)
returns public.publication_comments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_comment public.publication_comments%rowtype;
  v_status_key text;
begin
  if v_uid is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;

  select * into v_comment from public.publication_comments where id = p_comment_id for update;
  -- IS NOT TRUE: ver add_publication_comment (NULL de can_view_client = sin acceso).
  if not found or v_comment.author_id is distinct from v_uid or public.can_view_client(v_comment.client_id) is not true then
    raise exception 'Comentario no encontrado o sin permisos.' using errcode = '42501';
  end if;
  if v_comment.deleted_at is not null then
    return v_comment;
  end if;

  select s.key into v_status_key
  from public.publications p join public.statuses s on s.id = p.status_id
  where p.id = v_comment.publication_id
  for share of p;
  if v_status_key is distinct from 'in_review' then
    raise exception 'Los comentarios solo se pueden eliminar cuando la publicación está En revisión.' using errcode = 'P0001';
  end if;

  insert into public.publication_comment_revisions (comment_id, publication_id, client_id, action, previous_body, actor_id)
  values (v_comment.id, v_comment.publication_id, v_comment.client_id, 'delete', v_comment.body, v_uid);

  delete from public.publication_comment_mentions where comment_id = v_comment.id;

  delete from public.email_outbox_items i
  using public.email_outbox o
  where i.comment_id = v_comment.id and o.id = i.outbox_id and o.status = 'pending';

  update public.publication_comments
  set body = '', deleted_at = now(), deleted_by = v_uid
  where id = v_comment.id
  returning * into v_comment;

  return v_comment;
end;
$$;

-- Aprobación por el Client User: solo desde En revisión, solo su cliente, solo status_id, y solo sobre la
-- VERSIÓN que el cliente está viendo (p_expected_updated_at = publications.updated_at con el que se cargó la
-- vista). UPDATE condicional (bloqueo optimista): si la agencia guardó cambios o cambió el estado después,
-- afecta 0 filas, no se modifica nada y se devuelve un error que pide actualizar la publicación.
-- Errores (errcode P0001 + hint, para que la app distinga el motivo sin parsear el texto):
--   hint 'v16:status_changed' -> ya no está En revisión · hint 'v16:stale_version' -> cambió el contenido.
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

-- Pedido de email al cliente asociado a un cambio de estado (envío a revisión / aviso de aprobado).
-- Solo staff con can_manage_client. El estado actual debe coincidir con p_status_key. Idempotente por
-- (p_request_id, destinatario): un click = un request_id (incluye "Reenviar aviso"). Devuelve cuántos
-- destinatarios se encolaron. El envío lo hace el worker (F5).
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

-- Marcar como leídas (todas si p_ids es null). Solo filas propias.
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
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
  update public.notifications
  set read_at = now()
  where recipient_id = auth.uid()
    and read_at is null
    and (p_ids is null or id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Al abrir una publicación: marca como leídas sus notificaciones propias.
create or replace function public.mark_publication_notifications_read(p_publication_id uuid)
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
  update public.notifications
  set read_at = now()
  where recipient_id = auth.uid() and publication_id = p_publication_id and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ============================================================
-- 8) RLS
-- ============================================================
alter table public.publication_status_events enable row level security;
alter table public.publication_comments enable row level security;
alter table public.publication_comment_mentions enable row level security;
alter table public.publication_comment_revisions enable row level security;
alter table public.notifications enable row level security;
alter table public.email_outbox enable row level security;
alter table public.email_outbox_items enable row level security;
alter table public.planner_feature_flags enable row level security;

-- Lectura: cualquiera que pueda ver el cliente (incluye Super Admin no asignado). Sin políticas de
-- escritura: todo INSERT/UPDATE/DELETE pasa por las RPCs security definer de arriba.
drop policy if exists publication_status_events_select on public.publication_status_events;
create policy publication_status_events_select on public.publication_status_events
  for select to authenticated using (public.can_view_client(client_id));

drop policy if exists publication_comments_select on public.publication_comments;
create policy publication_comments_select on public.publication_comments
  for select to authenticated using (public.can_view_client(client_id));

drop policy if exists publication_comment_mentions_select on public.publication_comment_mentions;
create policy publication_comment_mentions_select on public.publication_comment_mentions
  for select to authenticated using (
    exists (
      select 1 from public.publication_comments c
      where c.id = comment_id and public.can_view_client(c.client_id)
    )
  );

drop policy if exists notifications_select_own on public.notifications;
-- Propias Y de un cliente que el usuario todavía puede ver: si se le quita la asignación a un Account Manager
-- (o un usuario cambia de cliente), deja de ver las notificaciones viejas de ese cliente (títulos incluidos).
create policy notifications_select_own on public.notifications
  for select to authenticated using (recipient_id = auth.uid() and public.can_view_client(client_id));

-- publication_comment_revisions, email_outbox, email_outbox_items, planner_feature_flags: RLS sin políticas =
-- deny-all. El flag lo leen solo funciones security definer.

-- ============================================================
-- 9) GRANTS
-- ============================================================
revoke all on public.publication_status_events, public.publication_comments, public.publication_comment_mentions,
  public.publication_comment_revisions, public.notifications, public.email_outbox, public.email_outbox_items,
  public.planner_feature_flags
  from public, anon, authenticated;

grant usage on schema public to authenticated, service_role;

grant select on public.publication_status_events, public.publication_comments, public.publication_comment_mentions,
  public.notifications
  to authenticated;

-- service_role: solo lectura (operación/diagnóstico). Las escrituras del worker pasan por RPCs (F5).
grant select on public.publication_status_events, public.publication_comments, public.publication_comment_mentions,
  public.publication_comment_revisions, public.notifications, public.email_outbox, public.email_outbox_items,
  public.planner_feature_flags
  to service_role;

-- Funciones internas: nadie las invoca por API.
revoke execute on function public.is_active_user(uuid) from public, anon, authenticated;
revoke execute on function public.notifications_enabled_for(uuid) from public, anon, authenticated;
revoke execute on function public.is_active_client_member(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.profile_display_name(text, text) from public, anon, authenticated;
revoke execute on function public.enqueue_comment_digest(uuid, uuid, uuid, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.fan_out_comment(uuid, uuid[], boolean) from public, anon, authenticated;
revoke execute on function public.sanitize_mentions(uuid[], uuid, uuid) from public, anon, authenticated;
revoke execute on function public.log_publication_status_change() from public, anon, authenticated;

-- RPCs de la app: solo authenticated (cada una valida rol/cliente adentro).
revoke execute on function public.list_mentionable_members(uuid) from public, anon;
revoke execute on function public.add_publication_comment(uuid, text, uuid[], uuid) from public, anon;
revoke execute on function public.edit_publication_comment(uuid, text, uuid[]) from public, anon;
revoke execute on function public.delete_publication_comment(uuid) from public, anon;
revoke execute on function public.approve_publication_as_client(uuid, timestamptz) from public, anon;
revoke execute on function public.request_status_email(uuid, text, uuid) from public, anon;
revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;
revoke execute on function public.mark_publication_notifications_read(uuid) from public, anon;

grant execute on function public.list_mentionable_members(uuid) to authenticated;
grant execute on function public.add_publication_comment(uuid, text, uuid[], uuid) to authenticated;
grant execute on function public.edit_publication_comment(uuid, text, uuid[]) to authenticated;
grant execute on function public.delete_publication_comment(uuid) to authenticated;
grant execute on function public.approve_publication_as_client(uuid, timestamptz) to authenticated;
grant execute on function public.request_status_email(uuid, text, uuid) to authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.mark_publication_notifications_read(uuid) to authenticated;
