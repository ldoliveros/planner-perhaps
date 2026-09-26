-- Log de auditoría de "Avisar al cliente" (email de publicación aprobada). Append-only: cada intento
-- (o reenvío) inserta una fila nueva, nunca se actualiza una existente — no hace falta updated_at ni
-- trigger set_updated_at acá.
--
-- Mismo patrón que daily_agenda_log (20260924000002): RLS habilitada sin políticas = deny-all para
-- anon/authenticated, con los GRANTs a service_role incluidos DESDE ESTA MISMA migración (a diferencia
-- de daily_agenda_log, que tuvo que corregirlos después en 20260924000003 — no repetir ese error).
-- Se lee/escribe siempre desde el Server Action vía createAdminClient(), después de verificar
-- can_manage_client(client_id) en código — mismo criterio de autorización explícita ya usado en
-- listClientMembers (lib/supabase/queries.ts) para este tipo de lectura entre roles.

create table public.publication_client_notifications (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.publications (id) on delete cascade,
  -- on delete set null (no cascade): si el Client User destinatario se elimina después, la fila de
  -- auditoría se conserva (con su email ya guardado abajo).
  recipient_user_id uuid references public.profiles (id) on delete set null,
  recipient_email text not null,
  status text not null check (status in ('sent', 'failed')),
  sent_at timestamptz not null default now(),
  resend_email_id text,
  error_message text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index publication_client_notifications_publication_id_idx
  on public.publication_client_notifications (publication_id, sent_at desc);

alter table public.publication_client_notifications enable row level security;
-- Sin create policy: deny-all para anon/authenticated. Todo el acceso pasa por service_role.
revoke all on public.publication_client_notifications from public, anon, authenticated;

grant usage on schema public to service_role;
grant select, insert on public.publication_client_notifications to service_role;
