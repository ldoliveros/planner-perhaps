-- Row Level Security. ADMIN: acceso completo. CLIENT: solo SELECT de su propio client_id.
-- Migration idempotente: cada policy se dropea (si existe) antes de recrearse.
alter table public.clients enable row level security;
alter table public.profiles enable row level security;
alter table public.calendars enable row level security;
alter table public.platforms enable row level security;
alter table public.account_types enable row level security;
alter table public.content_types enable row level security;
alter table public.statuses enable row level security;
alter table public.publications enable row level security;
alter table public.publication_destinations enable row level security;
alter table public.publication_assets enable row level security;

-- security definer: evita recursión al consultar profiles desde las policies de profiles.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.current_client_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select client_id from public.profiles where id = auth.uid();
$$;

-- profiles: cada usuario ve su propia fila (necesario para saber su rol tras el login).
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());

-- lookups globales: lectura para cualquier usuario autenticado, escritura solo admin.
drop policy if exists platforms_select on public.platforms;
create policy platforms_select on public.platforms
  for select using (auth.role() = 'authenticated');
drop policy if exists platforms_admin_write on public.platforms;
create policy platforms_admin_write on public.platforms
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists account_types_select on public.account_types;
create policy account_types_select on public.account_types
  for select using (auth.role() = 'authenticated');
drop policy if exists account_types_admin_write on public.account_types;
create policy account_types_admin_write on public.account_types
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists content_types_select on public.content_types;
create policy content_types_select on public.content_types
  for select using (auth.role() = 'authenticated');
drop policy if exists content_types_admin_write on public.content_types;
create policy content_types_admin_write on public.content_types
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists statuses_select on public.statuses;
create policy statuses_select on public.statuses
  for select using (auth.role() = 'authenticated');
drop policy if exists statuses_admin_write on public.statuses;
create policy statuses_admin_write on public.statuses
  for all using (public.is_admin()) with check (public.is_admin());

-- clients
drop policy if exists clients_admin_all on public.clients;
create policy clients_admin_all on public.clients
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists clients_select_own on public.clients;
create policy clients_select_own on public.clients
  for select using (id = public.current_client_id());

-- calendars
drop policy if exists calendars_admin_all on public.calendars;
create policy calendars_admin_all on public.calendars
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists calendars_select_own on public.calendars;
create policy calendars_select_own on public.calendars
  for select using (client_id = public.current_client_id());

-- publications
drop policy if exists publications_admin_all on public.publications;
create policy publications_admin_all on public.publications
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists publications_select_own on public.publications;
create policy publications_select_own on public.publications
  for select using (client_id = public.current_client_id());

-- publication_destinations (scope vía publications.client_id)
drop policy if exists publication_destinations_admin_all on public.publication_destinations;
create policy publication_destinations_admin_all on public.publication_destinations
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists publication_destinations_select_own on public.publication_destinations;
create policy publication_destinations_select_own on public.publication_destinations
  for select using (
    exists (
      select 1 from public.publications p
      where p.id = publication_id and p.client_id = public.current_client_id()
    )
  );

-- publication_assets (scope vía publications.client_id)
drop policy if exists publication_assets_admin_all on public.publication_assets;
create policy publication_assets_admin_all on public.publication_assets
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists publication_assets_select_own on public.publication_assets;
create policy publication_assets_select_own on public.publication_assets
  for select using (
    exists (
      select 1 from public.publications p
      where p.id = publication_id and p.client_id = public.current_client_id()
    )
  );
