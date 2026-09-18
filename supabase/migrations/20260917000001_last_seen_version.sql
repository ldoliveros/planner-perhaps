-- v1.2 Bloque A: persistir por-usuario la ultima version de Perhaps Planner
-- cuyas novedades ya vio, para el banner "Nuevas actualizaciones".
-- Nullable, sin default destructivo: las filas existentes quedan en null,
-- que la app interpreta como "todavia no vio ningun banner de esta version"
-- -> se le muestra UNICAMENTE el banner de la version actual (APP_VERSION),
-- nunca el historico retroactivo de versiones anteriores.
-- No requiere cambios de RLS: profiles_update_own ya permite que cada
-- usuario actualice su propia fila (protect_profiles solo congela
-- role/client_id/email, ninguna otra columna).
alter table public.profiles add column if not exists last_seen_version text;
