-- v1.6 — Reacciones a comentarios: 👍 ❤️ 👏 🎉 😂 👀.
--
-- Aplicada en QA (planner-qa-v16) el 2026-10-13 con el guard, tras dry-run OK. Producción: aplicar junto con el resto
-- de v1.6 antes del deploy. Requiere 20261008000001 (core) y 20261008000002 (Realtime).
--
-- Reglas:
--   * Cada usuario agrega o quita SU reacción; varios emojis distintos sí, el mismo emoji dos veces no
--     (PK comment_id + user_id + emoji). Solo los seis emojis aprobados (CHECK).
--   * Disponible con la publicación En revisión, Aprobada o Publicada (no en Borrador ni en otros estados), y nunca
--     sobre un comentario eliminado.
--   * Acceso: el mismo que para leer comentarios (can_view_client del cliente de la publicación) + usuario activo.
--     No amplía permisos de otros recursos: no toca publications, comentarios, menciones, notificaciones ni lecturas.
--   * Sin notificaciones (la RPC no llama a fan_out_comment ni al outbox) y sin cambios de estado.
--   * Quitar = active false (UPDATE), nunca DELETE desde la app: los eventos DELETE de Realtime no pasan por RLS y
--     llegarían a suscriptores de otros clientes; los UPDATE sí se filtran por RLS.
--   * publication_id / client_id se DERIVAN del comentario en un trigger (no los manda el cliente web): el filtro de
--     Realtime y la policy usan datos coherentes aunque se escriba por otra vía.
-- Rollback: bloque RX de supabase/rollback/v1.6/rollback_v16.sql. Pruebas: security_checks_replies_reactions.sql.

-- ============================================================
-- 0) GUARD
-- ============================================================
do $$
begin
  if to_regclass('public.publication_comments') is null then
    raise exception 'v16_comment_reactions: falta 20261008000001_v16_collab_core.sql; abortado sin cambios.';
  end if;
  if to_regclass('public.publication_comment_reactions') is not null then
    raise exception 'v16_comment_reactions: ya existe public.publication_comment_reactions; abortado sin cambios.';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('set_comment_reaction', 'derive_comment_reaction_scope')
  ) then
    raise exception 'v16_comment_reactions: ya existen funciones con estos nombres; abortado sin cambios.';
  end if;
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables = false) then
    raise exception 'v16_comment_reactions: supabase_realtime no existe o es FOR ALL TABLES; abortado sin cambios.';
  end if;
end $$;

-- ============================================================
-- 1) TABLA
-- ============================================================
create table public.publication_comment_reactions (
  comment_id uuid not null references public.publication_comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null,
  publication_id uuid not null references public.publications (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (comment_id, user_id, emoji),
  constraint publication_comment_reactions_emoji check (emoji in ('👍', '❤️', '👏', '🎉', '😂', '👀'))
);
create index if not exists publication_comment_reactions_publication_idx
  on public.publication_comment_reactions (publication_id) where active;

create trigger publication_comment_reactions_set_updated_at before update on public.publication_comment_reactions
  for each row execute function public.set_updated_at();

-- publication_id / client_id SIEMPRE los del comentario (no los que vengan en el INSERT/UPDATE).
create function public.derive_comment_reaction_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  select c.publication_id, c.client_id into new.publication_id, new.client_id
  from public.publication_comments c where c.id = new.comment_id;
  if new.publication_id is null then
    raise exception 'Comentario inexistente.' using errcode = '23503';
  end if;
  return new;
end;
$$;
revoke execute on function public.derive_comment_reaction_scope() from public, anon, authenticated;

create trigger publication_comment_reactions_scope
  before insert or update of comment_id, publication_id, client_id on public.publication_comment_reactions
  for each row execute function public.derive_comment_reaction_scope();

-- ============================================================
-- 2) RPC — agregar / quitar la reacción PROPIA (idempotente: p_active es el estado deseado)
-- ============================================================
create function public.set_comment_reaction(p_comment_id uuid, p_emoji text, p_active boolean)
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
  if v_status_key not in ('in_review', 'approved', 'published') then
    raise exception 'Las reacciones están disponibles con la publicación En revisión, Aprobada o Publicada.' using errcode = 'P0001';
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

-- ============================================================
-- 3) RLS — lectura con el mismo acceso que los comentarios; sin políticas de escritura (todo por la RPC)
-- ============================================================
alter table public.publication_comment_reactions enable row level security;

create policy publication_comment_reactions_select on public.publication_comment_reactions
  for select to authenticated using (public.can_view_client(client_id));

-- ============================================================
-- 4) GRANTS
-- ============================================================
revoke all on public.publication_comment_reactions from public, anon, authenticated;
grant select on public.publication_comment_reactions to authenticated;
grant select on public.publication_comment_reactions to service_role;

revoke execute on function public.set_comment_reaction(uuid, text, boolean) from public, anon;
grant execute on function public.set_comment_reaction(uuid, text, boolean) to authenticated;

-- ============================================================
-- 5) REALTIME — mismo canal de comentarios en la app (filtro publication_id). Guardas como 20261008000002:
--    RLS activa y replica identity DEFAULT (FULL filtraría la fila en un DELETE sin RLS).
-- ============================================================
do $$
declare
  v_rls boolean;
  v_replident "char";
begin
  select c.relrowsecurity, c.relreplident into v_rls, v_replident
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'publication_comment_reactions';
  if v_rls is not true then
    raise exception 'v16_comment_reactions: la tabla no tiene RLS activa; no se publica.';
  end if;
  if v_replident is distinct from 'd' then
    raise exception 'v16_comment_reactions: replica identity "%" (se espera DEFAULT); no se publica.', v_replident;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'publication_comment_reactions'
  ) then
    alter publication supabase_realtime add table public.publication_comment_reactions;
  end if;
end $$;
