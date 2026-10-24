-- v1.6 — Comentarios no leídos por usuario (contador de la pestaña Comentarios).
--
-- Aplicada en QA (planner-qa-v16) el 2026-10-12 con el guard (node supabase/qa/v1.6/qa-db.mjs push-dry / push).
-- Producción: aplicar junto con F1 antes del deploy de v1.6. Requiere 20261008000001_v16_collab_core.sql.
--
-- Solo `create`: no altera tablas, policies ni grants existentes. Rollback: bloque CR de
-- supabase/rollback/v1.6/rollback_v16.sql. Pruebas: supabase/qa/v1.6/security_checks_comment_reads.sql.
--
-- Diseño: CONSTANCIA DE LECTURA POR COMENTARIO (user_id, comment_id), no una marca "leído hasta X".
--   Una marca por created_at o por secuencia no es segura: add_publication_comment toma un lock compartido sobre la
--   publicación, así que dos comentarios simultáneos pueden confirmarse en un orden distinto al de su created_at /
--   secuencia, y "leído hasta el más nuevo cargado" daría por leído uno que todavía no se había mostrado. Con
--   constancias explícitas solo queda leído lo que la app efectivamente mostró (los ids que envía), sin asumir
--   ningún orden de created_at ni de UUID.
--   * Pendiente = comentario de la publicación, ajeno, no eliminado, posterior a la inicialización del usuario y
--     sin constancia. Lo calcula la base completo (list_unread_publication_comments), sin depender de la carga
--     (paginada o no) de la app.
--   * Inicialización: solo cuentan los comentarios creados después de la incorporación del usuario a ese cliente,
--     la más reciente de: comment_reads_baseline() (momento en que se aplicó esta migración), el alta del usuario
--     (profiles.created_at; un Client User pertenece a su cliente desde el alta) y, para el equipo, su asignación
--     a ese cliente (user_client_assignments.created_at). Así ni el historial previo a la migración ni lo anterior
--     a una incorporación posterior aparecen como pendientes. No cambia el modelo de autorización: el acceso lo
--     sigue decidiendo can_view_client(); esto solo fija desde cuándo se cuentan pendientes. Un Super Admin sin
--     asignación (ve todos los clientes) cuenta desde su alta. Es el único uso de created_at y solo separa
--     "antes/después" de un instante fijo, no ordena comentarios entre sí.
--   * Independiente de las notificaciones y del flag v16_notifications.
--   * Volumen: una fila por (usuario, comentario ajeno leído). Se borra en cascada con el comentario, la
--     publicación o el usuario.

-- ============================================================
-- 0) GUARD — no pisar objetos existentes
-- ============================================================
do $$
begin
  if to_regclass('public.publication_comment_reads') is not null then
    raise exception 'v16_comment_reads: ya existe public.publication_comment_reads; abortado sin cambios.';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('comment_reads_baseline', 'list_unread_publication_comments', 'mark_publication_comments_read')
  ) then
    raise exception 'v16_comment_reads: ya existen funciones con estos nombres; abortado sin cambios.';
  end if;
  if to_regclass('public.publication_comments') is null then
    raise exception 'v16_comment_reads: falta 20261008000001_v16_collab_core.sql; abortado sin cambios.';
  end if;
end $$;

-- ============================================================
-- 1) TABLA
-- ============================================================
create table public.publication_comment_reads (
  user_id uuid not null references public.profiles (id) on delete cascade,
  comment_id uuid not null references public.publication_comments (id) on delete cascade,
  -- Derivados SIEMPRE en la RPC desde el comentario (nunca del cliente web).
  publication_id uuid not null references public.publications (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, comment_id)
);
create index if not exists publication_comment_reads_user_publication_idx
  on public.publication_comment_reads (user_id, publication_id);
create index if not exists publication_comment_reads_comment_idx on public.publication_comment_reads (comment_id);

-- Momento de aplicación de esta migración, fijado al crearla (inicialización de usuarios sin constancias).
-- Delimitador $do$ (no $$): el cuerpo contiene "$b$$f$", que cerraría un $$ externo.
do $do$
begin
  execute format(
    $f$create function public.comment_reads_baseline()
       returns timestamptz
       language sql
       immutable
       set search_path = public, pg_temp
       as $b$ select %L::timestamptz $b$$f$,
    now()
  );
end $do$;

-- ============================================================
-- 2) RPCs
-- ============================================================

-- Comentarios PENDIENTES del usuario autenticado en una publicación que puede ver (conteo completo en la base).
create or replace function public.list_unread_publication_comments(p_publication_id uuid)
returns table (comment_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_uid uuid := auth.uid();
  v_client_id uuid;
  v_since timestamptz;
begin
  if v_uid is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;
  select p.client_id into v_client_id from public.publications p where p.id = p_publication_id;
  -- IS NOT TRUE: can_view_client() puede devolver NULL (= sin acceso).
  if v_client_id is null or public.can_view_client(v_client_id) is not true or public.is_active_user(v_uid) is not true then
    raise exception 'Publicación no encontrada o sin permisos.' using errcode = '42501';
  end if;

  -- greatest() ignora los NULL (usuario sin asignación a este cliente, p. ej. Client User o Super Admin).
  select greatest(
    public.comment_reads_baseline(),
    (select pr.created_at from public.profiles pr where pr.id = v_uid),
    (select a.created_at from public.user_client_assignments a where a.user_id = v_uid and a.client_id = v_client_id)
  )
  into v_since;

  return query
  select c.id
  from public.publication_comments c
  where c.publication_id = p_publication_id
    and c.deleted_at is null
    and c.author_id is distinct from v_uid
    and c.created_at > v_since
    and not exists (
      select 1 from public.publication_comment_reads r where r.user_id = v_uid and r.comment_id = c.id
    );
end;
$$;

-- Deja constancia de lectura de los comentarios que la app MOSTRÓ (ids explícitos). Ignora ids que no sean de
-- esta publicación, propios o eliminados; repetir es inocuo. Devuelve cuántas constancias nuevas se crearon.
create or replace function public.mark_publication_comments_read(p_publication_id uuid, p_comment_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_client_id uuid;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;
  if p_comment_ids is null or cardinality(p_comment_ids) = 0 then
    return 0;
  end if;
  if cardinality(p_comment_ids) > 1000 then
    raise exception 'Demasiados comentarios en una sola marca.' using errcode = '22023';
  end if;
  select p.client_id into v_client_id from public.publications p where p.id = p_publication_id;
  if v_client_id is null or public.can_view_client(v_client_id) is not true or public.is_active_user(v_uid) is not true then
    raise exception 'Publicación no encontrada o sin permisos.' using errcode = '42501';
  end if;

  insert into public.publication_comment_reads (user_id, comment_id, publication_id, client_id)
  select v_uid, c.id, c.publication_id, c.client_id
  from public.publication_comments c
  where c.id = any (p_comment_ids)
    and c.publication_id = p_publication_id
    and c.deleted_at is null
    and c.author_id is distinct from v_uid
  on conflict (user_id, comment_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ============================================================
-- 3) RLS — lectura solo de constancias propias y de clientes que el usuario todavía puede ver; sin políticas de
--    escritura (todo pasa por la RPC security definer).
-- ============================================================
alter table public.publication_comment_reads enable row level security;

create policy publication_comment_reads_select_own on public.publication_comment_reads
  for select to authenticated using (user_id = auth.uid() and public.can_view_client(client_id));

-- ============================================================
-- 4) GRANTS
-- ============================================================
revoke all on public.publication_comment_reads from public, anon, authenticated;
grant select on public.publication_comment_reads to authenticated;
grant select on public.publication_comment_reads to service_role;

revoke execute on function public.comment_reads_baseline() from public, anon, authenticated;
revoke execute on function public.list_unread_publication_comments(uuid) from public, anon;
revoke execute on function public.mark_publication_comments_read(uuid, uuid[]) from public, anon;

grant execute on function public.list_unread_publication_comments(uuid) to authenticated;
grant execute on function public.mark_publication_comments_read(uuid, uuid[]) to authenticated;
