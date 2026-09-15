-- Mismo gotcha ya documentado en 20260911000012_service_role_profiles_grant.sql:
-- RLS por sí sola no alcanza, Postgres exige el GRANT de la tabla ANTES de
-- evaluar las policies. service_role solo tenía grant sobre `profiles`
-- (Fase 4). lib/actions/team.ts ahora usa createAdminClient() (service_role)
-- también contra `clients` (validar que los clientes elegidos existan) y
-- `user_client_assignments` (leer/escribir asignaciones Account Manager <->
-- Cliente) — sin este GRANT, esas queries fallan con 42501 permission denied
-- aunque las policies de RLS sean correctas.
grant select, insert, update, delete on public.clients to service_role;
grant select, insert, update, delete on public.user_client_assignments to service_role;
