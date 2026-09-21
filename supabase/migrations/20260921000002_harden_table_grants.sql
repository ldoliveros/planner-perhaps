-- SECURITY HARDENING — privilegios de tabla innecesarios para anon/authenticated (schema public).
--
-- El default ACL del schema public (objetos de `postgres`) concedía TRUNCATE, REFERENCES,
-- TRIGGER y MAINTAIN (PG17) a anon/authenticated/service_role, y las 13 tablas actuales los
-- heredaron. PostgREST no los expone (no hay DDL ni TRUNCATE por API), pero TRUNCATE ignora RLS
-- y ninguno de estos privilegios lo usa la app: los triggers existentes y las FKs se ejecutan
-- con los privilegios del dueño; TRIGGER/REFERENCES solo se exigen al crearlos (migraciones,
-- como `postgres`).
--
-- Alcance estricto: SOLO estos cuatro privilegios, SOLO anon/authenticated. No toca
-- SELECT/INSERT/UPDATE/DELETE (ni el UPDATE por columnas de profiles), policies/RLS, triggers,
-- service_role ni el default ACL de supabase_admin.
--
-- Idempotente.

-- 1) Tablas existentes.
revoke truncate, references, trigger, maintain
  on all tables in schema public from anon, authenticated;

-- 2) Tablas futuras creadas por `postgres` (migraciones): que no vuelvan a heredarlos.
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables from anon, authenticated;
