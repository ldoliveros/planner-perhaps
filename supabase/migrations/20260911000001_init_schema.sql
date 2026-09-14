-- Fase 3 — esquema base del Planificador Editorial multicanal.
-- Migration idempotente: segura de re-ejecutar aunque haya quedado parcialmente aplicada.
create extension if not exists pgcrypto;

-- ============================================================
-- CLIENTS
-- ============================================================
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  color text not null default '#16A34A',
  active boolean not null default true,
  drive_folder_id text,
  drive_folder_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- PROFILES (extiende auth.users)
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'client' check (role in ('admin', 'client')),
  client_id uuid references public.clients (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- CALENDARS (siempre mensuales)
-- ============================================================
create table if not exists public.calendars (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  name text not null,
  month smallint not null check (month between 1 and 12),
  year smallint not null check (year between 2000 and 2100),
  description text,
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  drive_folder_id text,
  drive_folder_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists calendars_client_id_idx on public.calendars (client_id);

-- ============================================================
-- PLATFORMS — canales de publicación (multicanal, no solo redes sociales)
-- ============================================================
create table if not exists public.platforms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  icon text,
  color text not null default '#64748B',
  requires_account_type boolean not null default true,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.account_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sort_order integer not null default 0
);

create table if not exists public.content_types (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  sort_order integer not null default 0
);

create table if not exists public.statuses (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  color text not null,
  sort_order integer not null default 0,
  is_default boolean not null default false
);

-- ============================================================
-- PUBLICATIONS
-- ============================================================
create table if not exists public.publications (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.calendars (id) on delete cascade,
  -- client_id se deriva SIEMPRE server-side desde calendars.client_id (ver trigger abajo).
  client_id uuid not null references public.clients (id) on delete cascade,
  title text not null,
  publication_date date not null,
  publication_time time,
  campaign text,
  content_type_id uuid not null references public.content_types (id),
  status_id uuid not null references public.statuses (id),
  copy text not null default '',
  cta text,
  external_url text,
  internal_notes text,
  drive_folder_id text,
  drive_folder_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists publications_calendar_id_idx on public.publications (calendar_id);
create index if not exists publications_client_id_idx on public.publications (client_id);
create index if not exists publications_publication_date_idx on public.publications (publication_date);

-- ============================================================
-- PUBLICATION_DESTINATIONS — canal (+ tipo de cuenta opcional)
-- ============================================================
create table if not exists public.publication_destinations (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.publications (id) on delete cascade,
  platform_id uuid not null references public.platforms (id),
  account_type_id uuid references public.account_types (id),
  created_at timestamptz not null default now()
);
create index if not exists publication_destinations_publication_id_idx on public.publication_destinations (publication_id);
create index if not exists publication_destinations_platform_id_idx on public.publication_destinations (platform_id);

-- Evita destinos duplicados. NULL no es comparable con "=", así que se necesitan
-- dos índices únicos parciales: uno para canales con cuenta y otro sin cuenta.
create unique index if not exists publication_destinations_with_account_uidx
  on public.publication_destinations (publication_id, platform_id, account_type_id)
  where account_type_id is not null;
create unique index if not exists publication_destinations_without_account_uidx
  on public.publication_destinations (publication_id, platform_id)
  where account_type_id is null;

-- ============================================================
-- PUBLICATION_ASSETS — archivo original (is_primary) + preview (thumbnail_url)
-- ============================================================
create table if not exists public.publication_assets (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.publications (id) on delete cascade,
  type text not null check (type in ('image', 'video', 'pdf', 'document', 'other')),
  filename text not null,
  mime_type text,
  drive_file_id text,
  drive_file_url text,
  thumbnail_url text,
  file_size bigint,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists publication_assets_publication_id_idx on public.publication_assets (publication_id);

-- ============================================================
-- TRIGGERS
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger clients_set_updated_at before update on public.clients
  for each row execute function public.set_updated_at();
create or replace trigger calendars_set_updated_at before update on public.calendars
  for each row execute function public.set_updated_at();
create or replace trigger publications_set_updated_at before update on public.publications
  for each row execute function public.set_updated_at();

-- Deriva publications.client_id SIEMPRE desde calendars.client_id.
-- El valor enviado por el cliente/formulario (si lo hubiera) se ignora y se sobreescribe.
create or replace function public.set_publication_client_id()
returns trigger
language plpgsql
as $$
declare
  v_client_id uuid;
begin
  select client_id into v_client_id from public.calendars where id = new.calendar_id;
  if v_client_id is null then
    raise exception 'calendar_id % no corresponde a un calendario existente', new.calendar_id;
  end if;
  new.client_id := v_client_id;
  return new;
end;
$$;

create or replace trigger publications_set_client_id
  before insert or update of calendar_id on public.publications
  for each row execute function public.set_publication_client_id();

-- Crea automáticamente un profile (role='client' por defecto) al crear un usuario en auth.users.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'client')
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
