-- Client User con permiso Editor por cliente: puede crear y editar publicaciones de SU cliente (textos, título, tipo,
-- fecha/hora, estado, destinos y assets), con los calendarios, cuentas y campañas existentes de ese cliente. NO puede
-- eliminar, archivar ni restaurar publicaciones, ni administrar clientes, calendarios, cuentas, campañas, usuarios
-- ni permisos.
--
-- Diseño:
--   * El permiso vive en una relación usuario-cliente (`client_publication_editors`), no en el perfil: sin fila =
--     Lector (todos los usuarios actuales). Solo cuenta si coincide con el cliente actual del usuario
--     (profiles.client_id) y el usuario es un Client User activo.
--   * `can_manage_client` NO cambia: las políticas de staff siguen iguales y el editor recibe políticas ADITIVAS,
--     acotadas a publicaciones no archivadas de su cliente, sin DELETE.
--   * Nadie escribe la relación con su JWT: no hay grants de escritura para authenticated (la gestiona el Super Admin
--     por server action con service_role). Así un cliente no puede autoasignarse el permiso.
--   * Destinos: la cuenta tiene que ser del MISMO cliente que la publicación. Assets: el archivo tiene que estar en
--     la carpeta `<cliente>/<publicación>/` de esa publicación. Storage: solo en esas carpetas.
--
-- Rollback: supabase/rollback/client-editors-activity/rollback.sql (bloque CE).

-- ============================================================
-- 0) GUARD
-- ============================================================
do $$
begin
  if to_regclass('public.client_publication_editors') is not null then
    raise exception 'client_publication_editors: ya existe la tabla; abortado sin cambios.';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('is_client_publication_editor', 'guard_client_editor_publication_write')
  ) then
    raise exception 'client_publication_editors: ya existen funciones de esta migración; abortado sin cambios.';
  end if;
end $$;

-- ============================================================
-- 1) RELACIÓN USUARIO-CLIENTE
-- ============================================================
create table public.client_publication_editors (
  client_id uuid not null references public.clients (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (client_id, user_id)
);
create index client_publication_editors_user_idx on public.client_publication_editors (user_id);

alter table public.client_publication_editors enable row level security;
-- Lectura: el propio usuario (para saber si puede editar) y el staff que gestiona ese cliente.
create policy client_publication_editors_select on public.client_publication_editors
  for select to authenticated using (user_id = auth.uid() or public.can_manage_client(client_id));

revoke all on public.client_publication_editors from public, anon, authenticated;
grant select on public.client_publication_editors to authenticated;
grant select, insert, update, delete on public.client_publication_editors to service_role;

-- ============================================================
-- 2) ¿EL USUARIO ACTUAL ES EDITOR DE ESTE CLIENTE?
-- ============================================================
create function public.is_client_publication_editor(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_client_id is not null
    and exists (
      select 1
      from public.profiles p
      join public.client_publication_editors e on e.user_id = p.id and e.client_id = p.client_id
      where p.id = auth.uid() and p.role = 'client' and p.client_id = target_client_id
    )
    and public.is_active_user(auth.uid());
$$;
revoke execute on function public.is_client_publication_editor(uuid) from public, anon;
grant execute on function public.is_client_publication_editor(uuid) to authenticated, service_role;

-- ============================================================
-- 3) PUBLICACIONES (aditivas; sin DELETE)
-- ============================================================
-- client_id lo fija el trigger publications_set_client_id desde el calendario (que el editor solo ve si es de su
-- cliente); el WITH CHECK se evalúa sobre la fila final.
create policy publications_client_editor_insert on public.publications
  for insert to authenticated
  with check (public.is_client_publication_editor(client_id) and archived_at is null);

create policy publications_client_editor_update on public.publications
  for update to authenticated
  using (public.is_client_publication_editor(client_id) and archived_at is null)
  with check (public.is_client_publication_editor(client_id) and archived_at is null);

-- Archivar / restaurar es solo de staff: quien no gestiona el cliente no puede tocar archived_at / archived_by.
create function public.guard_client_editor_publication_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() = 'authenticated' then
    if tg_op = 'INSERT' then
      if not public.can_manage_client(new.client_id) then
        new.archived_at := null;
        new.archived_by := null;
      end if;
    elsif not public.can_manage_client(old.client_id)
      and (new.archived_at is distinct from old.archived_at or new.archived_by is distinct from old.archived_by) then
      raise exception 'No tenés permiso para archivar o restaurar publicaciones.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_client_editor_publication_write() from public, anon, authenticated;

create trigger publications_client_editor_guard
  before insert or update on public.publications
  for each row execute function public.guard_client_editor_publication_write();

-- ============================================================
-- 4) DESTINOS (solo cuentas del mismo cliente)
-- ============================================================
create policy publication_destinations_client_editor_insert on public.publication_destinations
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.publications p
      join public.client_accounts a on a.client_id = p.client_id
      where p.id = publication_destinations.publication_id
        and a.id = publication_destinations.client_account_id
        and p.archived_at is null
        and public.is_client_publication_editor(p.client_id)
    )
  );

create policy publication_destinations_client_editor_delete on public.publication_destinations
  for delete to authenticated
  using (
    exists (
      select 1 from public.publications p
      where p.id = publication_destinations.publication_id
        and p.archived_at is null
        and public.is_client_publication_editor(p.client_id)
    )
  );

-- ============================================================
-- 5) ASSETS (archivo dentro de la carpeta de esa publicación)
-- ============================================================
create policy publication_assets_client_editor_insert on public.publication_assets
  for insert to authenticated
  with check (
    exists (
      select 1 from public.publications p
      where p.id = publication_assets.publication_id
        and p.archived_at is null
        and public.is_client_publication_editor(p.client_id)
        and (
          publication_assets.thumbnail_url is null
          or publication_assets.thumbnail_url like p.client_id::text || '/' || p.id::text || '/%'
        )
    )
  );

create policy publication_assets_client_editor_update on public.publication_assets
  for update to authenticated
  using (
    exists (
      select 1 from public.publications p
      where p.id = publication_assets.publication_id
        and p.archived_at is null
        and public.is_client_publication_editor(p.client_id)
    )
  )
  with check (
    exists (
      select 1 from public.publications p
      where p.id = publication_assets.publication_id
        and p.archived_at is null
        and public.is_client_publication_editor(p.client_id)
        and (
          publication_assets.thumbnail_url is null
          or publication_assets.thumbnail_url like p.client_id::text || '/' || p.id::text || '/%'
        )
    )
  );

create policy publication_assets_client_editor_delete on public.publication_assets
  for delete to authenticated
  using (
    exists (
      select 1 from public.publications p
      where p.id = publication_assets.publication_id
        and p.archived_at is null
        and public.is_client_publication_editor(p.client_id)
    )
  );

-- ============================================================
-- 6) STORAGE: bucket thumbnails, carpeta <cliente>/<publicación>/ de una publicación editable
-- ============================================================
-- Comparación como texto: un nombre de carpeta que no es un uuid no rompe la política (no hay cast).
create policy thumbnails_client_editor_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'thumbnails'
    and exists (
      select 1 from public.publications p
      where p.id::text = (storage.foldername(name))[2]
        and p.client_id::text = (storage.foldername(name))[1]
        and p.archived_at is null
        and public.is_client_publication_editor(p.client_id)
    )
  );

create policy thumbnails_client_editor_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'thumbnails'
    and exists (
      select 1 from public.publications p
      where p.id::text = (storage.foldername(name))[2]
        and p.client_id::text = (storage.foldername(name))[1]
        and p.archived_at is null
        and public.is_client_publication_editor(p.client_id)
    )
  )
  with check (
    bucket_id = 'thumbnails'
    and exists (
      select 1 from public.publications p
      where p.id::text = (storage.foldername(name))[2]
        and p.client_id::text = (storage.foldername(name))[1]
        and p.archived_at is null
        and public.is_client_publication_editor(p.client_id)
    )
  );

create policy thumbnails_client_editor_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'thumbnails'
    and exists (
      select 1 from public.publications p
      where p.id::text = (storage.foldername(name))[2]
        and p.client_id::text = (storage.foldername(name))[1]
        and p.archived_at is null
        and public.is_client_publication_editor(p.client_id)
    )
  );
