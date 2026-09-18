-- v1.2 — Campaña pasa de texto libre a entidad reutilizable, propiedad del
-- CLIENTE (no del calendario). Migration aditiva y no destructiva:
--   * publications.campaign (texto histórico) NO se toca ni se borra — queda
--     como respaldo de transición.
--   * publications.internal_notes NO se toca.
--   * No hay cambios de Auth ni de roles.
--   * NO se agrega el grant de service_role sobre publications (hallazgo
--     detectado en la auditoría de Campaña — queda pendiente, deliberadamente
--     fuera de esta migración).
-- Los 3 valores reales de campaign auditados manualmente en el SQL Editor
-- (todos del mismo cliente, sin duplicados de casing/espacios) se migran 1:1,
-- sin ninguna normalización destructiva del texto visible.

-- ============================================================
-- CAMPAIGNS
-- ============================================================
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  name text not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists campaigns_client_id_idx on public.campaigns (client_id);

-- Unicidad por cliente, case-insensitive y sin espacios exteriores — aplica a
-- TODA fila (activa o archivada): reutilizar una campaña archivada equivalente
-- en vez de crear un duplicado es responsabilidad de la capa de aplicación
-- (lib/actions/campaigns.ts), este índice es la barrera real contra carreras.
create unique index if not exists campaigns_client_id_name_uidx
  on public.campaigns (client_id, lower(trim(name)));

create or replace trigger campaigns_set_updated_at before update on public.campaigns
  for each row execute function public.set_updated_at();

-- ============================================================
-- PUBLICATIONS.CAMPAIGN_ID — nueva fuente de verdad funcional.
-- publications.campaign (texto) queda intacta como respaldo histórico.
-- ============================================================
alter table public.publications
  add column if not exists campaign_id uuid references public.campaigns (id) on delete set null;
create index if not exists publications_campaign_id_idx on public.publications (campaign_id);

-- Integridad cliente<->campaña a nivel DB (no confiar solo en el frontend).
-- publications.client_id ya se deriva server-side de calendars.client_id vía
-- el trigger publications_set_client_id (ver 20260911000001_init_schema.sql).
-- Este trigger nuevo se nombra para ejecutar DESPUÉS de ese (los triggers
-- BEFORE de una misma tabla corren en orden alfabético de nombre: "set_client_id"
-- < "validate_campaign"), así new.client_id ya está resuelto cuando se valida.
create or replace function public.validate_publication_campaign()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_campaign_client_id uuid;
begin
  if new.campaign_id is null then
    return new;
  end if;

  select client_id into v_campaign_client_id
  from public.campaigns
  where id = new.campaign_id;

  if v_campaign_client_id is null then
    raise exception 'campaign_id % no corresponde a una campaña existente', new.campaign_id;
  end if;

  if v_campaign_client_id <> new.client_id then
    raise exception 'campaign_id % pertenece a un cliente distinto de la publicación', new.campaign_id;
  end if;

  return new;
end;
$$;

create or replace trigger publications_validate_campaign
  before insert or update of campaign_id, calendar_id on public.publications
  for each row execute function public.validate_publication_campaign();

-- ============================================================
-- BACKFILL — migra los valores reales de publications.campaign (auditados
-- manualmente, solo lectura, antes de esta migración) a campaigns + campaign_id.
-- Idempotente: usa on conflict do nothing / solo completa campaign_id donde
-- todavía está null, así se puede re-ejecutar sin duplicar ni pisar nada.
-- ============================================================
insert into public.campaigns (client_id, name)
select distinct p.client_id, p.campaign
from public.publications p
where p.campaign is not null and trim(p.campaign) <> ''
on conflict (client_id, lower(trim(name))) do nothing;

update public.publications p
set campaign_id = c.id
from public.campaigns c
where p.campaign_id is null
  and p.campaign is not null
  and trim(p.campaign) <> ''
  and c.client_id = p.client_id
  and lower(trim(c.name)) = lower(trim(p.campaign));

-- Verificación automática: si quedó alguna publicación con campaign histórico
-- no vacío sin campaign_id asignado, la migración falla en vez de aplicarse a
-- medias (ver requisito explícito del usuario de verificar la migración).
do $$
declare
  v_missing integer;
begin
  select count(*) into v_missing
  from public.publications
  where campaign is not null and trim(campaign) <> '' and campaign_id is null;

  if v_missing > 0 then
    raise exception 'Backfill de campaign_id incompleto: % publicaciones con campaign histórico sin campaign_id', v_missing;
  end if;
end $$;

-- ============================================================
-- RLS — mismo patrón que calendars/client_accounts/publications (Fase 6):
-- Super Admin global + Account Manager asignado (can_manage_client) para
-- lectura/escritura; Client User (current_client_id) solo lectura de las
-- campañas de su propio cliente. No se modifican roles existentes.
-- ============================================================
alter table public.campaigns enable row level security;

drop policy if exists campaigns_manage on public.campaigns;
create policy campaigns_manage on public.campaigns
  for all using (public.can_manage_client(client_id)) with check (public.can_manage_client(client_id));

drop policy if exists campaigns_select_own on public.campaigns;
create policy campaigns_select_own on public.campaigns
  for select using (client_id = public.current_client_id());

-- ============================================================
-- GRANTS (ver 20260911000005_grants.sql: RLS sola no alcanza sin el GRANT
-- base). Solo "authenticated" — deliberadamente SIN grant a service_role
-- (ese hallazgo, sobre publications, queda pendiente y fuera de esta
-- migración, según lo pedido).
-- ============================================================
grant select, insert, update, delete on public.campaigns to authenticated;
