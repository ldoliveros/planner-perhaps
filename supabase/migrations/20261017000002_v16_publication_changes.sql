-- v1.6 — Avisos de cambios de publicaciones por cliente (reemplaza a `publications` en Realtime).
--
-- Aplicada en QA (planner-qa-v16) el 2026-10-13 con el guard, tras dry-run OK. Producción: aplicar con el resto de v1.6. Requiere 20261015000001 (deja de usarse: esta migración saca `publications` de
-- supabase_realtime) y 20261017000001 (archivado).
--
-- Por qué (PROPUESTA_seguridad_publicaciones.md §1 y PROPUESTA_archivar_publicaciones.md, ajustes 2026-10-13):
--   1) DELETE: con `publications` publicada, cualquier usuario autenticado podía escuchar los DELETE (Realtime no les
--      aplica RLS) y ver ids de publicaciones borradas de OTROS clientes. Acá se publica SOLO una tabla de avisos
--      cuyos eventos son INSERT (siempre pasan por RLS: can_view_client del cliente del aviso). Los DELETE de limpieza
--      de esta tabla solo llevan su clave (`id` bigint del aviso), nunca un id de publicación.
--   2) Archivar: al archivar, la fila de `publications` deja de pasar la RLS del Client User y Realtime ya no le enviaba
--      nada → su Planner abierto la seguía mostrando. El aviso se filtra por CLIENTE (no por archivado): el Client User
--      recibe "cambió X", relee bajo RLS, ya no la ve y la quita. Lo mismo al restaurar (vuelve a aparecer) y al eliminar.
--   Los avisos solo llevan publication_id + client_id + tipo; el contenido siempre se relee bajo la RLS de publications.
--
-- Contacto con v1.5.1: un trigger AFTER en publications. Su cuerpo está protegido (EXCEPTION → WARNING): un fallo al
-- registrar el aviso NUNCA bloquea un guardado (mismo criterio que publications_status_event).
-- Rollback: bloque PC de supabase/rollback/v1.6/rollback_v16.sql (vuelve a publicar `publications` como en 20261015000001).

-- ============================================================
-- 0) GUARD
-- ============================================================
do $$
begin
  if to_regclass('public.publication_changes') is not null then
    raise exception 'v16_publication_changes: ya existe public.publication_changes; abortado sin cambios.';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'log_publication_change'
  ) then
    raise exception 'v16_publication_changes: ya existe log_publication_change; abortado sin cambios.';
  end if;
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables = false) then
    raise exception 'v16_publication_changes: supabase_realtime no existe o es FOR ALL TABLES; abortado sin cambios.';
  end if;
end $$;

-- ============================================================
-- 1) TABLA DE AVISOS
-- ============================================================
create table public.publication_changes (
  id bigint generated always as identity primary key,
  publication_id uuid not null,  -- sin FK: el aviso de un borrado sobrevive a la publicación
  client_id uuid not null references public.clients (id) on delete cascade,
  kind text not null check (kind in ('upsert', 'delete')),
  changed_at timestamptz not null default now()
);
create index if not exists publication_changes_changed_at_idx on public.publication_changes (changed_at);

alter table public.publication_changes enable row level security;
create policy publication_changes_select on public.publication_changes
  for select to authenticated using (public.can_view_client(client_id));

revoke all on public.publication_changes from public, anon, authenticated;
grant select on public.publication_changes to authenticated;
grant select on public.publication_changes to service_role;

-- ============================================================
-- 2) TRIGGER EN publications
-- ============================================================
create function public.log_publication_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    if tg_op = 'DELETE' then
      insert into public.publication_changes (publication_id, client_id, kind) values (old.id, old.client_id, 'delete');
    elsif tg_op = 'UPDATE' and new.client_id is distinct from old.client_id then
      -- Cambió de cliente (otro calendario): desaparece para el anterior y aparece para el nuevo.
      insert into public.publication_changes (publication_id, client_id, kind)
      values (old.id, old.client_id, 'delete'), (new.id, new.client_id, 'upsert');
    else
      insert into public.publication_changes (publication_id, client_id, kind) values (new.id, new.client_id, 'upsert');
    end if;
    -- Limpieza: los avisos solo sirven en vivo; se conserva un día.
    delete from public.publication_changes where changed_at < now() - interval '1 day';
  exception when others then
    raise warning 'log_publication_change: no se registró el aviso de %: %', coalesce(new.id, old.id), sqlerrm;
  end;
  return null;
end;
$$;
revoke execute on function public.log_publication_change() from public, anon, authenticated;

create trigger publications_log_change
  after insert or update or delete on public.publications
  for each row execute function public.log_publication_change();

-- ============================================================
-- 3) REALTIME — publicar los avisos y dejar de publicar `publications`
-- ============================================================
do $$
declare
  v_rls boolean;
  v_replident "char";
begin
  select c.relrowsecurity, c.relreplident into v_rls, v_replident
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'publication_changes';
  if v_rls is not true or v_replident is distinct from 'd' then
    raise exception 'v16_publication_changes: publication_changes sin RLS o con replica identity distinta de DEFAULT; abortado.';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'publication_changes'
  ) then
    alter publication supabase_realtime add table public.publication_changes;
  end if;
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'publications'
  ) then
    alter publication supabase_realtime drop table public.publications;
  end if;
end $$;
