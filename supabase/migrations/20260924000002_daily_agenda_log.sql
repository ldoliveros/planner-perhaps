-- Log de envíos de la Agenda diaria por email — deduplicación + retry seguro.
--
-- Uso exclusivo de la Edge Function (etapa siguiente), vía service_role: RLS habilitada sin
-- políticas para authenticated/anon (deny-all), mismo criterio que otras tablas internas del proyecto.
-- service_role bypassea RLS por diseño de Supabase, así que la Edge Function opera sin fricción.
--
-- Flujo de deduplicación/retry (ver detalle en el diseño acordado):
--   1) INSERT ... ON CONFLICT (user_id, agenda_date) DO NOTHING RETURNING id — reclama el envío.
--      Si no devuelve fila, ya existe: 'sent' => skip; 'failed' => retry (UPDATE a 'processing');
--      'processing' => retry solo si quedó stale (updated_at viejo), si no, skip por seguridad.
--   2) Enviar vía Resend.
--   3) UPDATE a 'sent' + resend_email_id (éxito) o 'failed' + error_message (fallo) — nunca antes del
--      paso 2, así 'sent' certifica que Resend aceptó el envío.
create table public.daily_agenda_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  agenda_date date not null,
  status text not null default 'processing' check (status in ('processing', 'sent', 'failed')),
  resend_email_id text,
  error_message text,
  attempt_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, agenda_date)
);

create index if not exists daily_agenda_log_agenda_date_idx on public.daily_agenda_log (agenda_date);

-- Reutiliza public.set_updated_at(), ya creada en 20260911000001_init_schema.sql — no redefinir.
create or replace trigger daily_agenda_log_set_updated_at before update on public.daily_agenda_log
  for each row execute function public.set_updated_at();

alter table public.daily_agenda_log enable row level security;
-- Sin create policy: RLS habilitada sin políticas = deny-all para authenticated/anon.
revoke all on public.daily_agenda_log from public, anon, authenticated;
