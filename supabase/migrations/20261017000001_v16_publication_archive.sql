-- v1.6 — Archivar publicaciones.
--
-- Aplicada en QA (planner-qa-v16) el 2026-10-13 con el guard, tras dry-run OK. Producción: aplicar con el resto de v1.6. Requiere 20261008000001 (core) y 20261014000002 (reacciones).
--
-- Reglas (decisiones de producto 2026-10-13):
--   * Archivar es independiente del estado editorial: no toca status_id ni ningún otro dato. Restaurar = archived_at
--     null: fecha, estado, contenido, destinos, assets, comentarios, respuestas, reacciones e historial quedan como
--     estaban.
--   * Una publicación archivada es de SOLO LECTURA hasta restaurarla (trigger): no se edita, no cambia de estado ni de
--     fecha, no recibe comentarios ni reacciones. Sí se puede restaurar o eliminar definitivamente.
--   * Staff (Super Admin y Account Manager asignado: publications_manage / can_manage_client) archiva, restaura, lista
--     y elimina. No hace falta política nueva de escritura: archivar/restaurar es un UPDATE que esa política ya permite.
--   * Client User: NO ve archivadas ni por consultas directas a la API. Se filtra en la base:
--       - publications_select_own agrega `archived_at is null` (y por arrastre publication_destinations y
--         publication_assets, cuyas políticas de Client User consultan publications con su RLS);
--       - publication_comments, publication_status_events y publication_comment_reactions: el Client User no ve las de
--         una publicación archivada (el staff sí). publication_comment_mentions sigue a publication_comments.
-- Compatibilidad con v1.5.1: columnas nuevas nullable (v1.5.1 lee con select * y las ignora); nada archivado mientras
-- v1.5.1 esté activa. Ver ROLLBACK.md (bloque AR): volver a v1.5.1 con publicaciones archivadas las vuelve a mostrar.
-- Rollback: bloque AR de supabase/rollback/v1.6/rollback_v16.sql. Pruebas: security_checks_archive.sql.

-- ============================================================
-- 0) GUARD
-- ============================================================
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'publications' and column_name in ('archived_at', 'archived_by')
  ) then
    raise exception 'v16_publication_archive: publications ya tiene columnas de archivado; abortado sin cambios.';
  end if;
  if to_regclass('public.publication_comments') is null or to_regclass('public.publication_comment_reactions') is null then
    raise exception 'v16_publication_archive: faltan migraciones previas de v1.6 (core / reacciones); abortado sin cambios.';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('publication_is_archived', 'prevent_archived_publication_changes', 'prevent_activity_on_archived_publication')
  ) then
    raise exception 'v16_publication_archive: ya existen funciones con estos nombres; abortado sin cambios.';
  end if;
end $$;

-- ============================================================
-- 1) COLUMNAS
-- ============================================================
alter table public.publications
  add column archived_at timestamptz,
  add column archived_by uuid references public.profiles (id) on delete set null;

create index if not exists publications_archived_idx
  on public.publications (client_id, archived_at desc) where archived_at is not null;

-- ============================================================
-- 2) SOLO LECTURA MIENTRAS ESTÁ ARCHIVADA
-- ============================================================
create function public.prevent_archived_publication_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Archivada antes Y después del UPDATE = se intentó modificarla sin restaurar.
  if old.archived_at is not null and new.archived_at is not null then
    raise exception 'La publicación está archivada: restaurala para modificarla.'
      using errcode = 'P0001', hint = 'v16:archived';
  end if;
  return new;
end;
$$;
revoke execute on function public.prevent_archived_publication_changes() from public, anon, authenticated;

create trigger publications_archived_readonly
  before update on public.publications
  for each row execute function public.prevent_archived_publication_changes();

-- Comentarios y reacciones nuevos sobre una archivada: rechazados (vale también para las RPCs security definer).
create function public.prevent_activity_on_archived_publication()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_publication_id uuid := (v_row ->> 'publication_id')::uuid;
begin
  -- Reacciones: el trigger que deriva publication_id puede correr DESPUÉS (orden alfabético de los BEFORE), así que
  -- se resuelve siempre desde el comentario.
  if v_row ? 'comment_id' then
    select c.publication_id into v_publication_id from public.publication_comments c where c.id = (v_row ->> 'comment_id')::uuid;
  end if;
  if exists (select 1 from public.publications p where p.id = v_publication_id and p.archived_at is not null) then
    raise exception 'La publicación está archivada.' using errcode = 'P0001', hint = 'v16:archived';
  end if;
  return new;
end;
$$;
revoke execute on function public.prevent_activity_on_archived_publication() from public, anon, authenticated;

create trigger publication_comments_not_archived
  before insert on public.publication_comments
  for each row execute function public.prevent_activity_on_archived_publication();

create trigger publication_comment_reactions_not_archived
  before insert or update on public.publication_comment_reactions
  for each row execute function public.prevent_activity_on_archived_publication();

-- ============================================================
-- 3) RLS — el Client User no ve archivadas
-- ============================================================
-- ¿Archivada? Solo responde por publicaciones que el usuario puede ver (si no, null). Se usa en políticas.
create function public.publication_is_archived(p_publication_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select p.archived_at is not null
  from public.publications p
  where p.id = p_publication_id and public.can_view_client(p.client_id) is true;
$$;
revoke execute on function public.publication_is_archived(uuid) from public, anon;
grant execute on function public.publication_is_archived(uuid) to authenticated;

drop policy if exists publications_select_own on public.publications;
create policy publications_select_own on public.publications
  for select using (client_id = public.current_client_id() and archived_at is null);

-- Comentarios / historial de estados / reacciones: staff (can_manage_client) como antes; el resto (Client User), solo
-- de publicaciones no archivadas. `is not true`: un null (sin acceso) también deja afuera.
drop policy if exists publication_comments_select on public.publication_comments;
create policy publication_comments_select on public.publication_comments
  for select to authenticated using (
    public.can_view_client(client_id)
    and (public.can_manage_client(client_id) or public.publication_is_archived(publication_id) is not true)
  );

drop policy if exists publication_status_events_select on public.publication_status_events;
create policy publication_status_events_select on public.publication_status_events
  for select to authenticated using (
    public.can_view_client(client_id)
    and (public.can_manage_client(client_id) or public.publication_is_archived(publication_id) is not true)
  );

drop policy if exists publication_comment_reactions_select on public.publication_comment_reactions;
create policy publication_comment_reactions_select on public.publication_comment_reactions
  for select to authenticated using (
    public.can_view_client(client_id)
    and (public.can_manage_client(client_id) or public.publication_is_archived(publication_id) is not true)
  );
