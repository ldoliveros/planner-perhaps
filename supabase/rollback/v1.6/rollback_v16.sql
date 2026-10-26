-- v1.6 — ROLLBACK SQL (NO es una migración: nunca mover a supabase/migrations/).
-- Procedimiento completo (orden, Netlify, verificación): supabase/rollback/v1.6/ROLLBACK.md.
--
-- Ejecutar SOLO con autorización explícita, en el SQL Editor (rol postgres), bloque por bloque.
-- El rollback PREDETERMINADO es el bloque A: NO borra tablas ni datos, todo es reversible (bloque R).
-- El bloque Z (destructivo) existe solo como referencia y requiere una decisión aparte.

-- ============================================================
-- A) ROLLBACK PREDETERMINADO — desactivar v1.6 sin perder datos
-- ============================================================

-- A0) Apagar las notificaciones automáticas de v1.6 (no borra nada: cambia una fila de configuración). Desde acá
--     el trigger y las RPCs ya no crean notificaciones ni encolan emails, y el worker descarta lo encolado.
update public.planner_feature_flags
set enabled = false, client_ids = '{}', note = coalesce(note, '') || ' | rollback ' || now()::text
where key = 'v16_notifications';

-- A1) Cortar envíos de emails: cron fuera (si 20261008000004 se aplicó). Seguro de re-ejecutar.
do $$
begin
  -- IF anidados: PL/pgSQL planifica la expresión completa de un IF, así que consultar cron.job en la misma
  -- condición que pg_extension fallaría ("cron.job does not exist") donde pg_cron no está instalado (QA).
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'planner-email-outbox') then
      perform cron.unschedule('planner-email-outbox');
    end if;
  end if;
end $$;

-- A2) Cancelar lo pendiente en la cola (queda auditable con estado 'cancelled'; no se borra nada).
--     Si el worker se vuelve a disparar a mano, no encuentra nada que enviar.
update public.email_outbox
set status = 'cancelled', locked_at = null, skip_reason = coalesce(skip_reason, 'rollback v1.6')
where status in ('pending', 'retry', 'processing');

-- A3) Desacoplar v1.6 del flujo de publicaciones de v1.5.1: el trigger queda deshabilitado (no se borra).
--     Efecto: dejan de crearse eventos de estado y notificaciones de revisión/aprobación.
alter table public.publications disable trigger publications_status_event;

-- A4) Cerrar la superficie de API de v1.6 para usuarios (las funciones y los datos se conservan):
--     comentar, aprobar como cliente, pedir emails y marcar leídas dejan de ser invocables desde la app.
--     Las lecturas (SELECT con RLS) quedan: no exponen nada nuevo y v1.5.1 no las usa.
-- add_publication_comment: firma de 4 argumentos (core) o de 5 (si 20261014000001 se aplicó).
do $$
begin
  if to_regprocedure('public.add_publication_comment(uuid, text, uuid[], uuid, uuid)') is not null then
    revoke execute on function public.add_publication_comment(uuid, text, uuid[], uuid, uuid) from authenticated;
  end if;
  if to_regprocedure('public.add_publication_comment(uuid, text, uuid[], uuid)') is not null then
    revoke execute on function public.add_publication_comment(uuid, text, uuid[], uuid) from authenticated;
  end if;
  -- (Si 20261014000002 se aplicó) reacciones.
  if to_regprocedure('public.set_comment_reaction(uuid, text, boolean)') is not null then
    revoke execute on function public.set_comment_reaction(uuid, text, boolean) from authenticated;
  end if;
end $$;
revoke execute on function public.edit_publication_comment(uuid, text, uuid[]) from authenticated;
revoke execute on function public.delete_publication_comment(uuid) from authenticated;
revoke execute on function public.approve_publication_as_client(uuid, timestamptz) from authenticated;
revoke execute on function public.request_status_email(uuid, text, uuid) from authenticated;
revoke execute on function public.mark_notifications_read(uuid[]) from authenticated;
revoke execute on function public.mark_publication_notifications_read(uuid) from authenticated;
revoke execute on function public.list_mentionable_members(uuid) from authenticated;
-- (Si 20261013000001 se aplicó) comentarios no leídos:
do $$
begin
  if to_regprocedure('public.mark_publication_comments_read(uuid, uuid[])') is not null then
    revoke execute on function public.list_unread_publication_comments(uuid) from authenticated;
    revoke execute on function public.mark_publication_comments_read(uuid, uuid[]) from authenticated;
  end if;
end $$;

-- A5) (Opcional) Sacar las tablas de Realtime (si 20261008000002 se aplicó). v1.5.1 no se suscribe a nada;
--     solo evita tráfico de clientes v1.6 que sigan abiertos.
do $$
declare v_table text;
begin
  foreach v_table in array array['notifications', 'publication_comments', 'publication_status_events',
                                 'publication_comment_reactions', 'publications', 'publication_changes'] loop
    if exists (select 1 from pg_publication_tables
               where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table) then
      execute format('alter publication supabase_realtime drop table public.%I', v_table);
    end if;
  end loop;
end $$;

-- A6) Verificación del estado desactivado (debe devolver: flag false/{}, trigger 'D', 0 jobs, 0 pendientes, 0 grants).
select
  (select enabled from public.planner_feature_flags where key = 'v16_notifications') as flag_enabled,          -- false
  (select client_ids from public.planner_feature_flags where key = 'v16_notifications') as flag_client_ids,    -- {}
  (select tgenabled from pg_trigger where tgname = 'publications_status_event') as trigger_state,      -- 'D'
  -- Sin pg_cron (p. ej. el proyecto QA) no existe cron.job: 0 sin error. La consulta a cron.job es dinámica
  -- (query_to_xml) y solo se evalúa si la tabla existe.
  case
    when to_regclass('cron.job') is null then 0
    else (xpath('/row/n/text()', query_to_xml(
      'select count(*) as n from cron.job where jobname = ''planner-email-outbox''', false, false, '')))[1]::text::int
  end as cron_jobs,                                                                                    -- 0
  (select count(*) from public.email_outbox where status in ('pending', 'retry', 'processing')) as outbox_pending, -- 0
  (select count(*) from information_schema.routine_privileges
    where grantee = 'authenticated' and routine_schema = 'public'
      and routine_name in ('add_publication_comment', 'edit_publication_comment', 'delete_publication_comment',
                           'approve_publication_as_client', 'request_status_email', 'mark_notifications_read',
                           'mark_publication_notifications_read', 'list_mentionable_members',
                           -- 20261013000001 (lecturas) y 20261014000002 (reacciones). add_publication_comment de
                           -- 5 argumentos (20261014000001) tiene el mismo nombre y ya se cuenta.
                           'list_unread_publication_comments', 'mark_publication_comments_read',
                           'set_comment_reaction')) as v16_rpc_grants;                                 -- 0

-- ============================================================
-- R) RE-ACTIVAR v1.6 (deshace el bloque A) — solo con la app v1.6 desplegada otra vez
-- ============================================================
-- alter table public.publications enable trigger publications_status_event;
-- Funciones cuya firma depende de qué migraciones están aplicadas (add_publication_comment de 4 o 5 argumentos,
-- lecturas y reacciones): grants condicionales, así el bloque R no falla en ningún estado.
-- do $$
-- begin
--   if to_regprocedure('public.add_publication_comment(uuid, text, uuid[], uuid, uuid)') is not null then
--     grant execute on function public.add_publication_comment(uuid, text, uuid[], uuid, uuid) to authenticated;
--   end if;
--   if to_regprocedure('public.add_publication_comment(uuid, text, uuid[], uuid)') is not null then
--     grant execute on function public.add_publication_comment(uuid, text, uuid[], uuid) to authenticated;
--   end if;
--   if to_regprocedure('public.mark_publication_comments_read(uuid, uuid[])') is not null then
--     grant execute on function public.list_unread_publication_comments(uuid) to authenticated;
--     grant execute on function public.mark_publication_comments_read(uuid, uuid[]) to authenticated;
--   end if;
--   if to_regprocedure('public.set_comment_reaction(uuid, text, boolean)') is not null then
--     grant execute on function public.set_comment_reaction(uuid, text, boolean) to authenticated;
--   end if;
-- end $$;
-- grant execute on function public.edit_publication_comment(uuid, text, uuid[]) to authenticated;
-- grant execute on function public.delete_publication_comment(uuid) to authenticated;
-- grant execute on function public.approve_publication_as_client(uuid, timestamptz) to authenticated;
-- grant execute on function public.request_status_email(uuid, text, uuid) to authenticated;
-- grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
-- grant execute on function public.mark_publication_notifications_read(uuid) to authenticated;
-- grant execute on function public.list_mentionable_members(uuid) to authenticated;
-- Realtime: volver a publicar exactamente lo que A5 sacó, salvo `publications` (desde 20261017000002 los cambios de
-- publicaciones viajan por `publication_changes`). Equivale a re-aplicar 20261008000002, el bloque 5 de 20261014000002
-- y el bloque 3 de 20261017000002; idempotente (solo agrega las tablas que existen y faltan). Sin esto la app v1.6
-- re-activada no recibe comentarios, notificaciones ni cambios de publicaciones en vivo.
-- do $$
-- declare v_table text;
-- begin
--   foreach v_table in array array['notifications', 'publication_comments', 'publication_status_events',
--                                  'publication_comment_reactions', 'publication_changes'] loop
--     if to_regclass('public.' || v_table) is not null and not exists (
--       select 1 from pg_publication_tables
--       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
--     ) then
--       execute format('alter publication supabase_realtime add table public.%I', v_table);
--     end if;
--   end loop;
-- end $$;
-- Cron: volver a aplicar el contenido de 20261008000004 (cron.schedule es idempotente por nombre).
-- Notificaciones: con el flag apagado no se acumularon nuevas. Re-activar para todos (lanzamiento):
--   update public.planner_feature_flags set enabled = true where key = 'v16_notifications';
-- o solo para QA Sandbox:
--   update public.planner_feature_flags set client_ids = array[(select id from public.clients where slug = 'qa-sandbox')]
--   where key = 'v16_notifications';

-- ============================================================
-- Z) DESTRUCTIVO — NO forma parte del rollback predeterminado. Requiere decisión explícita y export previo
-- (CSV desde el Dashboard) de publication_comments, publication_comment_revisions, publication_status_events,
-- notifications y email_outbox. Borra comentarios, auditoría, historial de aprobaciones y la bandeja.
-- ============================================================
-- begin;
-- drop function if exists public.mark_publication_comments_read(uuid, uuid[]);
-- drop function if exists public.list_unread_publication_comments(uuid);
-- drop table if exists public.publication_comment_reads;
-- drop function if exists public.comment_reads_baseline();
-- drop trigger if exists publications_status_event on public.publications;
-- drop function if exists public.skip_email_outbox(uuid, text);
-- drop function if exists public.fail_email_outbox(uuid, text, boolean);
-- drop function if exists public.complete_email_outbox(uuid, text);
-- drop function if exists public.log_outbox_client_notification(uuid, text, text, text);
-- drop function if exists public.freeze_email_outbox_render(uuid, text, text);
-- drop function if exists public.claim_email_outbox(integer, interval);
-- drop function if exists public.mark_publication_notifications_read(uuid);
-- drop function if exists public.mark_notifications_read(uuid[]);
-- drop function if exists public.request_status_email(uuid, text, uuid);
-- drop function if exists public.approve_publication_as_client(uuid, timestamptz);
-- drop function if exists public.delete_publication_comment(uuid);
-- drop function if exists public.edit_publication_comment(uuid, text, uuid[]);
-- drop function if exists public.add_publication_comment(uuid, text, uuid[], uuid);
-- drop function if exists public.add_publication_comment(uuid, text, uuid[], uuid, uuid);
-- drop function if exists public.set_comment_reaction(uuid, text, boolean);
-- drop table if exists public.publication_comment_reactions;
-- drop function if exists public.derive_comment_reaction_scope();
-- drop trigger if exists publication_comments_reply_same_publication on public.publication_comments;
-- drop function if exists public.check_comment_reply_same_publication();
-- drop function if exists public.log_publication_status_change();
-- drop function if exists public.fan_out_comment(uuid, uuid[], boolean);
-- drop function if exists public.enqueue_comment_digest(uuid, uuid, uuid, uuid, boolean);
-- drop function if exists public.sanitize_mentions(uuid[], uuid, uuid);
-- drop function if exists public.list_mentionable_members(uuid);
-- drop function if exists public.notifications_enabled_for(uuid);
-- drop table if exists public.planner_feature_flags;
-- drop table if exists public.email_outbox_items;
-- drop table if exists public.email_outbox;
-- drop table if exists public.notifications;
-- drop table if exists public.publication_comment_revisions;
-- drop table if exists public.publication_comment_mentions;
-- drop table if exists public.publication_comments;
-- drop table if exists public.publication_status_events;
-- drop function if exists public.profile_display_name(text, text);
-- drop function if exists public.is_active_client_member(uuid, uuid);
-- drop function if exists public.is_active_user(uuid);
-- delete from supabase_migrations.schema_migrations
--   where version in ('20261008000001', '20261008000002', '20261008000003', '20261008000004', '20261013000001',
--                     '20261014000001', '20261014000002');
-- commit;

-- ============================================================
-- CR) REVERTIR SOLO 20261013000001 (comentarios no leídos), sin tocar el resto de v1.6.
-- Pierde únicamente las constancias de lectura (al re-aplicarla, la inicialización vuelve a ser el momento de
-- aplicación: nada histórico queda pendiente). No toca comentarios ni notificaciones. La app v1.6 sin esta
-- migración muestra la pestaña "Comentarios" sin contador.
-- ============================================================
-- begin;
-- drop function if exists public.mark_publication_comments_read(uuid, uuid[]);
-- drop function if exists public.list_unread_publication_comments(uuid);
-- drop table if exists public.publication_comment_reads;
-- drop function if exists public.comment_reads_baseline();
-- delete from supabase_migrations.schema_migrations where version = '20261013000001';
-- commit;

-- ============================================================
-- RX) REVERTIR SOLO 20261014000002 (reacciones). Pierde solo las reacciones; no toca comentarios, menciones,
-- notificaciones ni lecturas. La app v1.6 sin la tabla no muestra reacciones (no falla).
-- ============================================================
-- begin;
-- do $$
-- begin
--   if exists (select 1 from pg_publication_tables
--              where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'publication_comment_reactions') then
--     alter publication supabase_realtime drop table public.publication_comment_reactions;
--   end if;
-- end $$;
-- drop function if exists public.set_comment_reaction(uuid, text, boolean);
-- drop table if exists public.publication_comment_reactions;
-- drop function if exists public.derive_comment_reaction_scope();
-- delete from supabase_migrations.schema_migrations where version = '20261014000002';
-- commit;

-- ============================================================
-- RP) REVERTIR SOLO 20261014000001 (respuestas persistentes). Restaura add_publication_comment de 4 argumentos
-- (idéntica a 20261008000001) ANTES de quitar la columna (la versión de 5 argumentos la usa). Pierde solo las
-- referencias "en respuesta a"; los comentarios quedan intactos. La app v1.6 sin la columna publica sin referencia.
-- ============================================================
-- begin;
-- drop trigger if exists publication_comments_reply_same_publication on public.publication_comments;
-- drop function if exists public.check_comment_reply_same_publication();
-- drop function if exists public.add_publication_comment(uuid, text, uuid[], uuid, uuid);
-- create function public.add_publication_comment(
--   p_publication_id uuid, p_body text, p_mentions uuid[] default '{}', p_request_id uuid default null
-- )
-- returns public.publication_comments
-- language plpgsql security definer set search_path = public, pg_temp
-- as $fn$
-- declare
--   v_uid uuid := auth.uid();
--   v_request_id uuid := coalesce(p_request_id, gen_random_uuid());
--   v_body text := btrim(coalesce(p_body, ''));
--   v_client_id uuid; v_status_key text; v_role text; v_full_name text; v_avatar text; v_mentions uuid[];
--   v_comment public.publication_comments%rowtype;
-- begin
--   if v_uid is null then raise exception 'No autenticado.' using errcode = '42501'; end if;
--   select * into v_comment from public.publication_comments where author_id = v_uid and request_id = v_request_id;
--   if found then return v_comment; end if;
--   select p.client_id, s.key into v_client_id, v_status_key
--   from public.publications p join public.statuses s on s.id = p.status_id
--   where p.id = p_publication_id for share of p;
--   if v_client_id is null or public.can_view_client(v_client_id) is not true or public.is_active_user(v_uid) is not true then
--     raise exception 'Publicación no encontrada o sin permisos.' using errcode = '42501';
--   end if;
--   if v_status_key is distinct from 'in_review' then
--     raise exception 'Los comentarios solo están habilitados cuando la publicación está En revisión.' using errcode = 'P0001';
--   end if;
--   if char_length(v_body) = 0 or char_length(v_body) > 5000 then
--     raise exception 'El comentario debe tener entre 1 y 5000 caracteres.' using errcode = '22023';
--   end if;
--   select role, full_name, avatar_url into v_role, v_full_name, v_avatar from public.profiles where id = v_uid;
--   v_mentions := public.sanitize_mentions(p_mentions, v_uid, v_client_id);
--   begin
--     insert into public.publication_comments (
--       publication_id, client_id, author_id, author_name, author_avatar_url, author_role, body, request_id
--     ) values (
--       p_publication_id, v_client_id, v_uid, public.profile_display_name(v_full_name, v_role), v_avatar, v_role,
--       v_body, v_request_id
--     ) returning * into v_comment;
--   exception when unique_violation then
--     select * into v_comment from public.publication_comments where author_id = v_uid and request_id = v_request_id;
--     return v_comment;
--   end;
--   insert into public.publication_comment_mentions (comment_id, user_id) select v_comment.id, unnest(v_mentions);
--   perform public.fan_out_comment(v_comment.id, v_mentions, true);
--   return v_comment;
-- end;
-- $fn$;
-- revoke execute on function public.add_publication_comment(uuid, text, uuid[], uuid) from public, anon;
-- grant execute on function public.add_publication_comment(uuid, text, uuid[], uuid) to authenticated;
-- alter table public.publication_comments drop constraint if exists publication_comments_reply_not_self;
-- drop index if exists public.publication_comments_reply_to_idx;
-- alter table public.publication_comments drop column if exists reply_to_comment_id;
-- delete from supabase_migrations.schema_migrations where version = '20261014000001';
-- commit;

-- ============================================================
-- RT) REVERTIR SOLO 20261015000001 (publicaciones en vivo). No pierde datos: solo saca public.publications de
-- Realtime. La app v1.6 vuelve a funcionar sin vivo (los cambios de otras sesiones se ven al recargar).
-- ============================================================
-- begin;
-- do $$
-- begin
--   if exists (select 1 from pg_publication_tables
--              where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'publications') then
--     alter publication supabase_realtime drop table public.publications;
--   end if;
-- end $$;
-- delete from supabase_migrations.schema_migrations where version = '20261015000001';
-- commit;

-- ============================================================
-- IN) REVERTIR SOLO 20261016000001 (retiro de publications.internal_notes). Vuelve a crear la columna VACÍA (el
-- contenido no se recupera). No hace falta para que v1.5.1 funcione (tolera la columna ausente); solo restaura el
-- esquema anterior si se lo necesita por otro motivo.
-- ============================================================
-- begin;
-- alter table public.publications add column if not exists internal_notes text;
-- delete from supabase_migrations.schema_migrations where version = '20261016000001';
-- commit;

-- ============================================================
-- PC) REVERTIR SOLO 20261017000002 (avisos de cambios por cliente). No pierde datos de publicaciones: quita la tabla
-- de avisos y su trigger, y vuelve a publicar `publications` en Realtime (el estado de 20261015000001, con su
-- exposición de ids en DELETE). La app v1.6 vuelve a sincronizar en vivo recién con una versión que escuche
-- `publications`; hasta entonces, sin vivo (los cambios se ven al recargar).
-- ============================================================
-- begin;
-- drop trigger if exists publications_log_change on public.publications;
-- drop function if exists public.log_publication_change();
-- do $$
-- begin
--   if exists (select 1 from pg_publication_tables
--              where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'publication_changes') then
--     alter publication supabase_realtime drop table public.publication_changes;
--   end if;
--   if not exists (select 1 from pg_publication_tables
--                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'publications') then
--     alter publication supabase_realtime add table public.publications;
--   end if;
-- end $$;
-- drop table if exists public.publication_changes;
-- delete from supabase_migrations.schema_migrations where version = '20261017000002';
-- commit;

-- ============================================================
-- AR) REVERTIR SOLO 20261017000001 (archivado). ANTES: restaurar o revisar las archivadas — al quitar las columnas,
-- todas las publicaciones archivadas vuelven a verse (en v1.6 y en v1.5.1); no se pierde ningún dato de ellas, solo la
-- marca de archivado. Restaura exactamente las políticas anteriores.
-- ============================================================
-- begin;
-- drop trigger if exists publications_archived_readonly on public.publications;
-- drop trigger if exists publication_comments_not_archived on public.publication_comments;
-- drop trigger if exists publication_comment_reactions_not_archived on public.publication_comment_reactions;
-- drop policy if exists publications_select_own on public.publications;
-- create policy publications_select_own on public.publications
--   for select using (client_id = public.current_client_id());
-- drop policy if exists publication_comments_select on public.publication_comments;
-- create policy publication_comments_select on public.publication_comments
--   for select to authenticated using (public.can_view_client(client_id));
-- drop policy if exists publication_status_events_select on public.publication_status_events;
-- create policy publication_status_events_select on public.publication_status_events
--   for select to authenticated using (public.can_view_client(client_id));
-- drop policy if exists publication_comment_reactions_select on public.publication_comment_reactions;
-- create policy publication_comment_reactions_select on public.publication_comment_reactions
--   for select to authenticated using (public.can_view_client(client_id));
-- drop function if exists public.publication_is_archived(uuid);
-- drop function if exists public.prevent_activity_on_archived_publication();
-- drop function if exists public.prevent_archived_publication_changes();
-- drop index if exists public.publications_archived_idx;
-- alter table public.publications drop column if exists archived_by;
-- alter table public.publications drop column if exists archived_at;
-- delete from supabase_migrations.schema_migrations where version = '20261017000001';
-- commit;

-- ============================================================
-- EM) REVERTIR SOLO 20261018000001 (pausa de emails de colaboración). Sin pérdida de datos: vuelve a crear
-- enqueue_comment_digest y request_status_email EXACTAMENTE como en 20261008000001 (create or replace: conserva
-- grants), quita collab_emails_enabled_for y el flag `v16_collab_emails`. Desde ese momento, con
-- `v16_notifications` encendido, los comentarios vuelven a encolar resúmenes que nadie procesa sin F5.
-- Para retomar los emails en F5 NO hace falta este bloque: alcanza con encender el flag `v16_collab_emails`.
-- ============================================================
-- begin;
-- create or replace function public.enqueue_comment_digest(
--   p_recipient_id uuid,
--   p_publication_id uuid,
--   p_client_id uuid,
--   p_comment_id uuid,
--   p_is_mention boolean
-- )
-- returns void
-- language plpgsql
-- security definer
-- set search_path = public, pg_temp
-- as $$
-- declare
--   v_outbox_id uuid;
--   v_tries integer := 0;
-- begin
--   loop
--     v_tries := v_tries + 1;
--
--     select id into v_outbox_id
--     from public.email_outbox
--     where kind = 'comment_digest'
--       and recipient_id = p_recipient_id
--       and publication_id = p_publication_id
--       and status = 'pending'
--     for update;
--
--     exit when v_outbox_id is not null;
--
--     begin
--       insert into public.email_outbox (kind, recipient_id, publication_id, client_id, send_after)
--       values ('comment_digest', p_recipient_id, p_publication_id, p_client_id, now() + interval '15 minutes')
--       returning id into v_outbox_id;
--       exit;
--     exception when unique_violation then
--       -- Otra transacción abrió la ventana en paralelo: volver a tomarla con FOR UPDATE.
--       if v_tries >= 5 then
--         raise;
--       end if;
--     end;
--   end loop;
--
--   insert into public.email_outbox_items (outbox_id, comment_id, is_mention)
--   values (v_outbox_id, p_comment_id, p_is_mention)
--   on conflict (outbox_id, comment_id)
--     do update set is_mention = public.email_outbox_items.is_mention or excluded.is_mention;
-- end;
-- $$;
-- create or replace function public.request_status_email(
--   p_publication_id uuid,
--   p_status_key text,
--   p_request_id uuid
-- )
-- returns integer
-- language plpgsql
-- security definer
-- set search_path = public, pg_temp
-- as $$
-- declare
--   v_uid uuid := auth.uid();
--   v_client_id uuid;
--   v_current_key text;
--   v_event_id uuid;
--   v_kind text;
--   v_count integer;
-- begin
--   if v_uid is null then
--     raise exception 'No autenticado.' using errcode = '42501';
--   end if;
--   if p_status_key not in ('in_review', 'approved') or p_request_id is null then
--     raise exception 'Pedido de email inválido.' using errcode = '22023';
--   end if;
--
--   select p.client_id, s.key into v_client_id, v_current_key
--   from public.publications p join public.statuses s on s.id = p.status_id
--   where p.id = p_publication_id;
--
--   if v_client_id is null or public.can_manage_client(v_client_id) is not true then
--     raise exception 'Publicación no encontrada o sin permisos.' using errcode = '42501';
--   end if;
--   if v_current_key is distinct from p_status_key then
--     raise exception 'El estado de la publicación cambió; no se envió el email.' using errcode = 'P0001';
--   end if;
--   if public.notifications_enabled_for(v_client_id) is not true then
--     raise exception 'Los avisos por email de v1.6 todavía no están activos. El cambio de estado sí se guardó.'
--       using errcode = 'P0001', hint = 'v16:notifications_disabled';
--   end if;
--
--   select e.id into v_event_id
--   from public.publication_status_events e
--   join public.statuses s on s.id = e.to_status_id and s.key = p_status_key
--   where e.publication_id = p_publication_id
--   order by e.created_at desc
--   limit 1;
--
--   if v_event_id is not null then
--     update public.publication_status_events set email_requested = true where id = v_event_id;
--   end if;
--
--   v_kind := case when p_status_key = 'in_review' then 'review_requested' else 'approved_client' end;
--
--   insert into public.email_outbox (
--     kind, recipient_id, publication_id, client_id, send_after, source_event_id, request_id, created_by
--   )
--   select v_kind, p.id, p_publication_id, v_client_id, now(), v_event_id, p_request_id, v_uid
--   from public.profiles p
--   where p.role = 'client' and p.client_id = v_client_id and public.is_active_user(p.id)
--   on conflict (request_id, recipient_id) where request_id is not null do nothing;
--
--   get diagnostics v_count = row_count;
--   return v_count;
-- end;
-- $$;
-- drop function if exists public.collab_emails_enabled_for(uuid);
-- delete from public.planner_feature_flags where key = 'v16_collab_emails';
-- delete from supabase_migrations.schema_migrations where version = '20261018000001';
-- commit;
