-- SECURITY HOTFIX — escalada de privilegios vía UPDATE de la propia fila de `profiles`.
--
-- Causa: protect_profiles() (20260916000001) congelaba role/client_id/email solo si
-- `current_user = 'authenticated'`. Al ser SECURITY DEFINER, current_user dentro de la función
-- es el dueño (postgres), nunca 'authenticated' -> la protección jamás se activaba y la policy
-- profiles_update_own (id = auth.uid()) dejaba a cualquier usuario autenticado reescribirse
-- role / client_id / email con la anon key (p. ej. role = 'super_admin').
--
-- Defensa en profundidad (esta migración NO crea/borra policies ni toca RLS):
--   1) Permisos de columna: `authenticated` deja de tener UPDATE de tabla completa y solo puede
--      actualizar las columnas de auto-servicio. Quien intente escribir role/client_id/email
--      recibe 42501 (permission denied). Todo cambio de rol/cliente/email sigue haciéndose desde
--      server actions con service_role (lib/actions/team.ts, client-users.ts), que conserva su
--      grant propio (20260911000012).
--   2) Trigger: protect_profiles() usa auth.role() (claim del JWT de la request) en lugar de
--      current_user. Segunda barrera por si algún día se vuelve a ampliar el grant de columnas.
--      service_role y las sesiones SQL directas (auth.role() null) no se congelan: las
--      operaciones administrativas legítimas no cambian.
--
-- Idempotente.

-- ============================================================
-- 1) GRANTS DE COLUMNA
-- ============================================================
-- El REVOKE a nivel tabla también quita cualquier grant de columna previo.
revoke update on public.profiles from authenticated;
revoke update on public.profiles from anon;
revoke update on public.profiles from public;

grant update (full_name, avatar_url, last_seen_version) on public.profiles to authenticated;

-- ============================================================
-- 2) TRIGGER protect_profiles — mismo cuerpo, condición corregida
-- ============================================================
create or replace function public.protect_profiles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining_super_admins integer;
begin
  if TG_OP = 'DELETE' then
    if old.role = 'super_admin' then
      select count(*) into remaining_super_admins
        from public.profiles where role = 'super_admin' and id <> old.id;
      if remaining_super_admins = 0 then
        raise exception 'No se puede eliminar al último Super Admin del sistema.';
      end if;
    end if;
    return old;
  end if;

  -- UPDATE: una request con JWT de usuario (auth.role() = 'authenticated' / 'anon') nunca puede
  -- cambiar role/client_id/email de una fila, sin importar el payload — se restauran al valor
  -- anterior en silencio. NO se usa current_user: dentro de una función SECURITY DEFINER es el
  -- dueño de la función, no el rol de la request. Con service_role (server actions de Super
  -- Admin) o SQL directo, auth.role() no es 'authenticated'/'anon' y la rama no aplica.
  if auth.role() in ('authenticated', 'anon') then
    new.role := old.role;
    new.client_id := old.client_id;
    new.email := old.email;
  end if;

  if old.role = 'super_admin' and new.role <> 'super_admin' then
    select count(*) into remaining_super_admins
      from public.profiles where role = 'super_admin' and id <> old.id;
    if remaining_super_admins = 0 then
      raise exception 'No se puede degradar al último Super Admin del sistema.';
    end if;
  end if;

  return new;
end;
$$;

-- El trigger profiles_protect ya existe (before update or delete). `create or replace function`
-- conserva el vínculo y los EXECUTE revocados por 20260916000002.
