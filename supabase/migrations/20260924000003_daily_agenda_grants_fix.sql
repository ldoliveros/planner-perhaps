-- Corrige dos GRANTs faltantes detectados en QA post-aplicación de 20260924000001/20260924000002:
--   * daily_agenda_log: RLS bypass (service_role) no alcanza sin el GRANT SQL base — mismo gotcha ya
--     documentado en 20260911000012_service_role_profiles_grant.sql. Sin esto, ni service_role podía
--     escribir en la tabla.
--   * profiles.daily_agenda_enabled: authenticated tiene UPDATE por columnas específicas desde
--     20260921000001_fix_profiles_privilege_escalation.sql (full_name, avatar_url, last_seen_version);
--     daily_agenda_enabled no estaba en esa lista porque no existía todavía. Sin esto, el toggle de
--     Mi perfil no podía persistir para nadie.

-- daily_agenda_log
grant usage on schema public to service_role;
grant select, insert, update, delete on public.daily_agenda_log to service_role;

-- profiles.daily_agenda_enabled
grant update (daily_agenda_enabled) on public.profiles to authenticated;
