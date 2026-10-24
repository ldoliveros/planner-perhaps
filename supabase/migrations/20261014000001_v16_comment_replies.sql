-- v1.6 — Respuestas persistentes: un comentario puede referenciar al comentario que responde (misma publicación).
--
-- Aplicada en QA (planner-qa-v16) el 2026-10-13 con el guard, tras dry-run OK. Producción: aplicar junto con el resto
-- de v1.6 antes del deploy. Requiere 20261008000001_v16_collab_core.sql.
--
-- Qué hace:
--   1) publication_comments.reply_to_comment_id (nullable, sin default: las filas existentes no cambian).
--      FK a publication_comments(id) ON DELETE SET NULL (los comentarios se eliminan con soft delete; un borrado físico
--      — cascada de una publicación — no deja referencias colgadas).
--   2) Integridad: CHECK (no se responde a sí mismo) + trigger BEFORE INSERT/UPDATE que exige que el original sea de
--      la MISMA publicación. Vale para cualquier escritura (RPC, SQL Editor, service_role), no solo para la app.
--   3) add_publication_comment con el parámetro opcional p_reply_to (default null). Mismo cuerpo que la versión de
--      20261008000001 (permisos, estado En revisión, largo, menciones, idempotencia por request_id, fan_out_comment):
--      solo agrega la validación de p_reply_to y la columna en el INSERT. Si p_reply_to no es un comentario de la
--      misma publicación se ignora (null) — nunca se referencia otra publicación ni otro cliente.
--      Cambia la firma → drop de la de 4 argumentos + create de la de 5 en la misma transacción, re-aplicando los
--      grants. Las llamadas existentes (argumentos nombrados de supabase-js, o 4 posicionales) siguen funcionando.
--   4) Sin cambios de RLS: la columna se lee con la policy existente publication_comments_select (can_view_client).
--      Realtime ya publica la tabla (20261008000002): la columna viaja en los eventos INSERT/UPDATE con la misma RLS.
--   Menciones, notificaciones (fan_out_comment), edición, eliminación y lecturas (publication_comment_reads): sin
--   cambios.
-- Rollback: bloque RP de supabase/rollback/v1.6/rollback_v16.sql. Pruebas: security_checks_replies_reactions.sql.

-- ============================================================
-- 0) GUARD
-- ============================================================
do $$
begin
  if to_regclass('public.publication_comments') is null then
    raise exception 'v16_comment_replies: falta 20261008000001_v16_collab_core.sql; abortado sin cambios.';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'publication_comments' and column_name = 'reply_to_comment_id'
  ) then
    raise exception 'v16_comment_replies: ya existe publication_comments.reply_to_comment_id; abortado sin cambios.';
  end if;
  if to_regprocedure('public.add_publication_comment(uuid, text, uuid[], uuid)') is null then
    raise exception 'v16_comment_replies: no existe add_publication_comment(uuid, text, uuid[], uuid) (¿ya se aplicó?); abortado sin cambios.';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'check_comment_reply_same_publication'
  ) then
    raise exception 'v16_comment_replies: ya existe check_comment_reply_same_publication; abortado sin cambios.';
  end if;
end $$;

-- ============================================================
-- 1) COLUMNA + INTEGRIDAD
-- ============================================================
alter table public.publication_comments
  add column reply_to_comment_id uuid references public.publication_comments (id) on delete set null;

alter table public.publication_comments
  add constraint publication_comments_reply_not_self check (reply_to_comment_id is null or reply_to_comment_id <> id);

create index if not exists publication_comments_reply_to_idx
  on public.publication_comments (reply_to_comment_id) where reply_to_comment_id is not null;

-- El original tiene que ser de la MISMA publicación (y por lo tanto del mismo cliente).
create function public.check_comment_reply_same_publication()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.reply_to_comment_id is not null and not exists (
    select 1 from public.publication_comments o
    where o.id = new.reply_to_comment_id and o.publication_id = new.publication_id
  ) then
    raise exception 'La respuesta tiene que referenciar un comentario de la misma publicación.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.check_comment_reply_same_publication() from public, anon, authenticated;

create trigger publication_comments_reply_same_publication
  before insert or update of reply_to_comment_id, publication_id on public.publication_comments
  for each row execute function public.check_comment_reply_same_publication();

-- ============================================================
-- 2) add_publication_comment con p_reply_to (opcional)
-- ============================================================
drop function public.add_publication_comment(uuid, text, uuid[], uuid);

create function public.add_publication_comment(
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
  if v_status_key is distinct from 'in_review' then
    raise exception 'Los comentarios solo están habilitados cuando la publicación está En revisión.' using errcode = 'P0001';
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

revoke execute on function public.add_publication_comment(uuid, text, uuid[], uuid, uuid) from public, anon;
grant execute on function public.add_publication_comment(uuid, text, uuid[], uuid, uuid) to authenticated;
