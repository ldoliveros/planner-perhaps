-- Cuentas reales del cliente: reemplaza el modelo platform_id + account_type_id
-- (genérico) en publication_destinations por client_account_id (una cuenta
-- concreta, ej: "@aionis.health"). Un cliente puede tener varias cuentas de la
-- misma plataforma (no hay unique(client_id, platform_id) a propósito).

-- ============================================================
-- CLIENT_ACCOUNTS
-- ============================================================
create table if not exists public.client_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  platform_id uuid not null references public.platforms (id),
  name text not null,
  handle text,
  url text,
  account_type_id uuid references public.account_types (id),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists client_accounts_client_id_idx on public.client_accounts (client_id);
create index if not exists client_accounts_platform_id_idx on public.client_accounts (platform_id);

create or replace trigger client_accounts_set_updated_at before update on public.client_accounts
  for each row execute function public.set_updated_at();

-- ============================================================
-- PUBLICATION_DESTINATIONS: platform_id + account_type_id -> client_account_id
-- ============================================================
-- Los destinos existentes (9 filas) son todos de publicaciones de prueba/QA
-- (Nota 1, test, Post de prueba QA, Contenido desde +) — ningún cliente real
-- tiene contenido publicado todavía. Confirmado con el usuario: se limpian en
-- vez de auto-generar cuentas "placeholder" (ej. "Instagram (Empresa)") que
-- habría que revisar y renombrar a mano. Las publicaciones en sí NO se tocan,
-- solo pierden sus destinos — se vuelven a asignar desde el nuevo selector.
-- Guardado en columna existente = migration ya corrió antes: no repetir el delete.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'publication_destinations' and column_name = 'client_account_id'
  ) then
    delete from public.publication_destinations;
  end if;
end $$;

drop index if exists public.publication_destinations_with_account_uidx;
drop index if exists public.publication_destinations_without_account_uidx;
drop index if exists public.publication_destinations_platform_id_idx;

alter table public.publication_destinations
  add column if not exists client_account_id uuid references public.client_accounts (id) on delete cascade;
alter table public.publication_destinations
  alter column client_account_id set not null;

-- platform_id/account_type_id quedan implícitos vía client_accounts (join) —
-- mantenerlos nullable y sin uso repetiría el mismo cruft que ya evitamos con
-- calendars.month/year.
alter table public.publication_destinations
  drop column if exists platform_id,
  drop column if exists account_type_id;

create index if not exists publication_destinations_client_account_id_idx
  on public.publication_destinations (client_account_id);
create unique index if not exists publication_destinations_unique_account_uidx
  on public.publication_destinations (publication_id, client_account_id);

-- ============================================================
-- PLATFORMS: canales pedidos por el usuario (Blog / Web ya existía en la
-- base pero no en las migrations — se agrega acá para que quede reproducible).
-- ============================================================
insert into public.platforms (name, slug, icon, color, requires_account_type, sort_order) values
  ('Blog / Web', 'blog', null, '#0EA5E9', false, 4),
  ('X / Twitter', 'x', 'x', '#000000', true, 5),
  ('YouTube', 'youtube', 'youtube', '#FF0000', true, 6),
  ('Newsletter', 'newsletter', null, '#F59E0B', false, 7)
on conflict (slug) do nothing;

-- ============================================================
-- RLS
-- ============================================================
alter table public.client_accounts enable row level security;

drop policy if exists client_accounts_admin_all on public.client_accounts;
create policy client_accounts_admin_all on public.client_accounts
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists client_accounts_select_own on public.client_accounts;
create policy client_accounts_select_own on public.client_accounts
  for select using (client_id = public.current_client_id());

-- ============================================================
-- GRANTS (ver 20260911000005_grants.sql: RLS solo no alcanza sin el GRANT base)
-- ============================================================
grant select, insert, update, delete on public.client_accounts to authenticated;
