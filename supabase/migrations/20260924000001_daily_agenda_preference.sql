-- Preferencia "Agenda diaria por email" (staff: Super Admin / Account Manager). Default ON.
--
-- Sin cambio de RLS: profiles_update_own (Fase 7, 20260916000001_profile_self_edit_and_avatars.sql) ya
-- permite a cada usuario auto-editar cualquier columna no congelada por protect_profiles
-- (role/client_id/email) — esta columna queda auto-editable de inmediato, sin política nueva.
--
-- Client User puede tener la columna en `true` por default igual que el resto, pero es inofensivo: la
-- Agenda diaria (Edge Function, etapa siguiente) filtra por role in ('super_admin','account_manager')
-- antes de considerar a nadie, así que un Client User nunca es destinatario sin importar este valor.
alter table public.profiles
  add column if not exists daily_agenda_enabled boolean not null default true;
