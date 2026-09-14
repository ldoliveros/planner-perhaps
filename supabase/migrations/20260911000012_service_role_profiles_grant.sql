-- El cliente admin (service_role) usado en lib/supabase/admin.ts para invitar
-- usuarios cliente necesita poder leer/actualizar profiles directamente
-- (asigna client_id + role tras crear el usuario vía la Admin API de Auth).
-- service_role bypassea RLS, pero igual necesita el GRANT base — mismo caso
-- que ya vimos con `authenticated` en 20260911000005_grants.sql.
grant usage on schema public to service_role;
grant select, insert, update, delete on public.profiles to service_role;
