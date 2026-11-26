-- v1.6 — Comentarios abiertos en todos los estados salvo Publicada (Borrador, En revisión, Aprobada y Descartada).
--
-- Antes: escribir / editar / eliminar comentarios solo En revisión. Ahora: en todos los estados salvo Publicada. Publicada:
-- historial visible (lectura sin cambios: RLS de publication_comments por can_view_client, sin estado) y sin comentarios
-- nuevos, respuestas, ediciones ni eliminaciones. Si la publicación deja de estar Publicada, se habilitan de nuevo (el
-- chequeo es sobre el estado vigente, en cada RPC). Reacciones: en todos los estados (antes En revisión, Aprobada o
-- Publicada), para no ofrecer comentarios sin reacciones.
--
-- Solo reemplaza el chequeo de estado (create or replace, misma firma: conserva grants). Acceso, autor, largo,
-- menciones, auditoría y notificaciones quedan idénticos. Sin cambios de tablas, RLS ni grants a anon.
-- Requiere las migraciones v1.6 (20261008000001, 20261014000001, 20261014000002).

-- Única fuente de la regla en la base. NULL (estado desconocido) = cerrado.
create or replace function public.comments_open_for_status(p_status_key text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select coalesce(p_status_key in ('draft', 'in_review', 'approved', 'discarded'), false);
$fn$;

revoke execute on function public.comments_open_for_status(text) from public, anon, authenticated;

-- Agregar comentario (o respuesta).

create or replace function public.add_publication_comment(
  p_publication_id uuid,
  p_body text,
  p_mentions uuid[] default '{}',
  p_request_id uuid default null,
  p_reply_to uuid default null
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
  v_reply_to uuid;
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
  if public.comments_open_for_status(v_status_key) is not true then
    raise exception 'No se pueden agregar comentarios: la publicación está Publicada.' using errcode = 'P0001';
  end if;
  if char_length(v_body) = 0 or char_length(v_body) > 5000 then
    raise exception 'El comentario debe tener entre 1 y 5000 caracteres.' using errcode = '22023';
  end if;

  -- v1.6 respuestas: solo un comentario de ESTA publicación; cualquier otro id se ignora (sin referencia).
  if p_reply_to is not null then
    select c.id into v_reply_to
    from public.publication_comments c
    where c.id = p_reply_to and c.publication_id = p_publication_id;
  end if;

  select role, full_name, avatar_url into v_role, v_full_name, v_avatar from public.profiles where id = v_uid;
  v_mentions := public.sanitize_mentions(p_mentions, v_uid, v_client_id);

  begin
    insert into public.publication_comments (
      publication_id, client_id, author_id, author_name, author_avatar_url, author_role, body, request_id,
      reply_to_comment_id
    ) values (
      p_publication_id, v_client_id, v_uid, public.profile_display_name(v_full_name, v_role), v_avatar, v_role,
      v_body, v_request_id, v_reply_to
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

-- Editar comentario propio.
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
  if public.comments_open_for_status(v_status_key) is not true then
    raise exception 'No se pueden editar comentarios: la publicación está Publicada.' using errcode = 'P0001';
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

-- Eliminar comentario propio (soft delete).
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
  if public.comments_open_for_status(v_status_key) is not true then
    raise exception 'No se pueden eliminar comentarios: la publicación está Publicada.' using errcode = 'P0001';
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

-- Reacciones.
create or replace function public.set_comment_reaction(p_comment_id uuid, p_emoji text, p_active boolean)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_client_id uuid;
  v_deleted_at timestamptz;
  v_status_key text;
  v_result boolean;
begin
  if v_uid is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;
  if p_active is null then
    raise exception 'Falta el estado de la reacción.' using errcode = '22023';
  end if;
  if p_emoji is null or p_emoji not in ('👍', '❤️', '👏', '🎉', '😂', '👀') then
    raise exception 'Reacción no válida.' using errcode = '22023';
  end if;

  select c.client_id, c.deleted_at, s.key into v_client_id, v_deleted_at, v_status_key
  from public.publication_comments c
  join public.publications p on p.id = c.publication_id
  join public.statuses s on s.id = p.status_id
  where c.id = p_comment_id;

  -- Mismo criterio de acceso que para leer el comentario. IS NOT TRUE: NULL = sin acceso.
  if v_client_id is null or public.can_view_client(v_client_id) is not true or public.is_active_user(v_uid) is not true then
    raise exception 'Comentario no encontrado o sin permisos.' using errcode = '42501';
  end if;
  if v_deleted_at is not null then
    raise exception 'No se puede reaccionar a un comentario eliminado.' using errcode = 'P0001';
  end if;
  if coalesce(v_status_key, '') not in ('draft', 'in_review', 'approved', 'published', 'discarded') then
    raise exception 'Reacción no disponible para el estado de la publicación.' using errcode = 'P0001';
  end if;

  -- publication_id / client_id los completa el trigger BEFORE desde el comentario (NOT NULL se verifica después
  -- de los triggers BEFORE).
  insert into public.publication_comment_reactions (comment_id, user_id, emoji, active)
  values (p_comment_id, v_uid, p_emoji, p_active)
  on conflict (comment_id, user_id, emoji) do update set active = excluded.active
    where public.publication_comment_reactions.active is distinct from excluded.active
  returning active into v_result;
  -- Sin cambio (ya estaba en ese estado): devolver el estado vigente.
  return coalesce(v_result, p_active);
end;
$$;
