-- v1.2.1 — El handle pasa a ser el identificador principal de una cuenta/canal (obligatorio) y el nombre
-- pasa a ser opcional/secundario.
--
--   * El handle se guarda SIN "@" (el "@" es solo presentación).
--   * `name` pasa a nullable; `handle` pasa a NOT NULL.
--   * CHECK: handle no vacío, sin "@" inicial y sin espacios.
--   * Unicidad case-insensitive por (cliente, plataforma, handle), incluyendo cuentas inactivas.
--     La plataforma es `platform_id` (`account_type_id` es solo Personal/Empresa y no forma parte de la clave).
--
-- Backfill (auditoría previa): se quita el "@" inicial de los handles existentes y se asigna handle a las dos
-- cuentas que no tenían: AIONIS Health / Facebook -> "aionis" y QA Sandbox / Facebook -> "qa.sandbox".
--
-- Seguridad:
--   * Todo corre en un único bloque DO (atómico): si una guarda falla, no queda nada aplicado.
--   * Idempotente: los constraints/índice se crean solo si faltan y el backfill solo actúa si hace falta.
--   * Aborta si los datos cambiaron desde la auditoría: cuentas sin handle distintas de las dos auditadas,
--     handles vacíos o con espacios, o colisiones después de normalizar.
--   * updated_at NO se modifica (normalización técnica, no una edición): set_updated_at() pisa NEW.updated_at
--     siempre, así que el trigger se deshabilita solo durante los UPDATE (misma transacción).
do $$
declare
  v_aionis_fb uuid;
  v_qa_fb uuid;
  v_null_total integer;
  v_null_expected integer;
  v_bad integer;
  v_collisions text;
begin
  -- Cuentas sin handle: solo pueden ser las dos auditadas (mismo cliente, plataforma y nombre).
  select count(*) into v_null_total from public.client_accounts where handle is null;

  select a.id into v_aionis_fb
    from public.client_accounts a
    join public.clients c on c.id = a.client_id
    join public.platforms p on p.id = a.platform_id
    where a.handle is null and c.name = 'AIONIS Health' and p.slug = 'facebook' and a.name = 'AIONIS Health';

  select a.id into v_qa_fb
    from public.client_accounts a
    join public.clients c on c.id = a.client_id
    join public.platforms p on p.id = a.platform_id
    where a.handle is null and c.slug = 'qa-sandbox' and p.slug = 'facebook' and a.name = 'QA Sandbox';

  v_null_expected := (v_aionis_fb is not null)::int + (v_qa_fb is not null)::int;
  if v_null_total <> v_null_expected then
    raise exception 'client_accounts_handle_primary: hay % cuentas sin handle y solo % coinciden con las auditadas; abortado.',
      v_null_total, v_null_expected;
  end if;

  -- Handles ya presentes: no vacíos, y sin espacios una vez normalizados.
  select count(*) into v_bad
    from public.client_accounts
    where handle is not null
      and (btrim(handle) = '' or regexp_replace(btrim(handle), '^@+', '') !~ '^[^[:space:]]+$');
  if v_bad > 0 then
    raise exception 'client_accounts_handle_primary: % handles vacíos o con espacios; abortado.', v_bad;
  end if;

  -- Colisiones (cliente, plataforma, handle normalizado) considerando el backfill.
  select string_agg(format('%s/%s/%s', client_id, platform_id, h), '; ') into v_collisions
    from (
      select client_id, platform_id, lower(h) as h
      from (
        select client_id, platform_id,
               case
                 when id = v_aionis_fb then 'aionis'
                 when id = v_qa_fb then 'qa.sandbox'
                 else regexp_replace(btrim(handle), '^@+', '')
               end as h
        from public.client_accounts
      ) n
      group by client_id, platform_id, lower(h)
      having count(*) > 1
    ) d;
  if v_collisions is not null then
    raise exception 'client_accounts_handle_primary: colisiones de handle tras normalizar (%); abortado.', v_collisions;
  end if;

  -- Backfill + normalización (sin tocar updated_at).
  alter table public.client_accounts disable trigger client_accounts_set_updated_at;

  update public.client_accounts set handle = 'aionis' where id = v_aionis_fb;
  update public.client_accounts set handle = 'qa.sandbox' where id = v_qa_fb;
  update public.client_accounts set handle = regexp_replace(btrim(handle), '^@+', '')
    where handle is not null and handle is distinct from regexp_replace(btrim(handle), '^@+', '');

  alter table public.client_accounts enable trigger client_accounts_set_updated_at;

  -- Schema.
  alter table public.client_accounts alter column name drop not null;
  alter table public.client_accounts alter column handle set not null;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.client_accounts'::regclass and conname = 'client_accounts_handle_not_blank'
  ) then
    alter table public.client_accounts
      add constraint client_accounts_handle_not_blank check (btrim(handle) <> '');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.client_accounts'::regclass and conname = 'client_accounts_handle_format'
  ) then
    -- Sin "@" inicial y sin espacios (el "@" es presentación, no dato).
    alter table public.client_accounts
      add constraint client_accounts_handle_format check (handle ~ '^[^@[:space:]][^[:space:]]*$');
  end if;

  create unique index if not exists client_accounts_client_platform_handle_uidx
    on public.client_accounts (client_id, platform_id, lower(handle));
end $$;
