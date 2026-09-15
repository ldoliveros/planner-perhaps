-- Fase 6 — jerarquía de roles: super_admin / account_manager / client.
-- Migration idempotente: segura de re-ejecutar aunque haya quedado parcialmente aplicada.

-- ============================================================
-- 1) Migrar el rol existente ANTES de endurecer el constraint.
--    Hoy solo existe un profile con role='admin' (el Super Admin actual).
-- ============================================================
alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set role = 'super_admin' where role = 'admin';
alter table public.profiles add constraint profiles_role_check
  check (role in ('super_admin', 'account_manager', 'client'));

-- ============================================================
-- 2) USER_CLIENT_ASSIGNMENTS — many-to-many Account Manager <-> Cliente.
-- ============================================================
create table if not exists public.user_client_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  unique (user_id, client_id)
);
create index if not exists user_client_assignments_user_id_idx on public.user_client_assignments (user_id);
create index if not exists user_client_assignments_client_id_idx on public.user_client_assignments (client_id);

-- ============================================================
-- 3) Funciones security definer — mismo patrón que is_admin()/current_client_id()
--    (Fase 3): evita recursión de RLS al consultar profiles/asignaciones
--    desde dentro de las propias policies.
-- ============================================================
create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'super_admin'
  );
$$;

create or replace function public.has_assigned_client(target_client_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles p
    join public.user_client_assignments a on a.user_id = p.id
    where p.id = auth.uid() and p.role = 'account_manager' and a.client_id = target_client_id
  );
$$;

-- Super Admin (global) O Account Manager asignado a ESE cliente puntual.
create or replace function public.can_manage_client(target_client_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_super_admin() or public.has_assigned_client(target_client_id);
$$;

-- can_manage_client() + el propio Client User (solo lectura de su cliente).
create or replace function public.can_view_client(target_client_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.can_manage_client(target_client_id) or public.current_client_id() = target_client_id;
$$;

-- ============================================================
-- 4) Reemplazar las policies "*_admin_all" (is_admin()) por las nuevas
--    funciones. Las policies "*_select_own" (current_client_id(), Client
--    User) NO se tocan.
-- ============================================================
drop policy if exists clients_admin_all on public.clients;
create policy clients_super_admin_write on public.clients
  for all using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists clients_select_own on public.clients;
create policy clients_select_permitted on public.clients
  for select using (public.can_view_client(id));

drop policy if exists calendars_admin_all on public.calendars;
create policy calendars_manage on public.calendars
  for all using (public.can_manage_client(client_id)) with check (public.can_manage_client(client_id));

drop policy if exists client_accounts_admin_all on public.client_accounts;
create policy client_accounts_manage on public.client_accounts
  for all using (public.can_manage_client(client_id)) with check (public.can_manage_client(client_id));

drop policy if exists publications_admin_all on public.publications;
create policy publications_manage on public.publications
  for all using (public.can_manage_client(client_id)) with check (public.can_manage_client(client_id));

drop policy if exists publication_destinations_admin_all on public.publication_destinations;
create policy publication_destinations_manage on public.publication_destinations
  for all using (
    exists (select 1 from public.publications p where p.id = publication_id and public.can_manage_client(p.client_id))
  ) with check (
    exists (select 1 from public.publications p where p.id = publication_id and public.can_manage_client(p.client_id))
  );

drop policy if exists publication_assets_admin_all on public.publication_assets;
create policy publication_assets_manage on public.publication_assets
  for all using (
    exists (select 1 from public.publications p where p.id = publication_id and public.can_manage_client(p.client_id))
  ) with check (
    exists (select 1 from public.publications p where p.id = publication_id and public.can_manage_client(p.client_id))
  );

-- profiles: administración de usuarios queda exclusivamente en Super Admin.
-- profiles_select_own (cada usuario ve su propia fila) no se toca.
drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_super_admin_all on public.profiles
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- lookups globales: la escritura queda exclusivamente en Super Admin.
drop policy if exists platforms_admin_write on public.platforms;
create policy platforms_admin_write on public.platforms
  for all using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists account_types_admin_write on public.account_types;
create policy account_types_admin_write on public.account_types
  for all using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists content_types_admin_write on public.content_types;
create policy content_types_admin_write on public.content_types
  for all using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists statuses_admin_write on public.statuses;
create policy statuses_admin_write on public.statuses
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- ============================================================
-- 5) RLS + grants de user_client_assignments — exclusivamente Super Admin.
--    Un Account Manager nunca lee ni escribe esta tabla directamente: sus
--    permisos le llegan resueltos a través de can_manage_client().
-- ============================================================
alter table public.user_client_assignments enable row level security;
drop policy if exists user_client_assignments_super_admin_all on public.user_client_assignments;
create policy user_client_assignments_super_admin_all on public.user_client_assignments
  for all using (public.is_super_admin()) with check (public.is_super_admin());

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.user_client_assignments to authenticated;
