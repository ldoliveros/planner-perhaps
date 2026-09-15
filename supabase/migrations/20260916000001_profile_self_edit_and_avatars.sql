-- Fase 7 — avatar de perfil, edición de perfil propio y protección del
-- último Super Admin. Migration idempotente.

-- ============================================================
-- 1) AVATAR_URL
-- ============================================================
alter table public.profiles add column if not exists avatar_url text;

-- ============================================================
-- 2) PROTECCIÓN "NUNCA 0 SUPER ADMIN" (trigger, red de seguridad real).
--    Cubre role/delete. banned_until vive en auth.users (fuera del alcance
--    de un trigger de Postgres sobre `profiles`) — ese caso se valida
--    server-side en lib/actions/team.ts (setTeamMemberActive) antes de
--    llamar a la Auth Admin API.
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

  -- UPDATE: un usuario editando su propia fila vía RLS (rol Postgres
  -- "authenticated") nunca puede cambiar su propio role/client_id/email,
  -- sin importar qué payload mande — se restauran al valor anterior en
  -- silencio. Los cambios de rol legítimos los hace un Super Admin desde
  -- lib/actions/team.ts vía service_role (ya validado con
  -- requireSuperAdmin() antes de llegar acá) y no pasan por esta rama.
  if current_user = 'authenticated' then
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

drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect
  before update or delete on public.profiles
  for each row execute function public.protect_profiles();

-- ============================================================
-- 3) RLS: cada usuario puede actualizar su propia fila (full_name/avatar_url;
--    role/client_id/email quedan congelados por el trigger de arriba, así
--    que no hace falta restringir columnas a nivel de GRANT: `authenticated`
--    ya tiene UPDATE de tabla completa desde Fase 3 y una restricción por
--    columna no puede "angostar" ese grant previo).
-- ============================================================
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ============================================================
-- 4) STORAGE: bucket "avatars" — público para lectura (foto de perfil, no
--    es contenido sensible del cliente; evita re-resolver signed URLs en
--    cada carga de header). Escritura restringida a la propia carpeta
--    {user_id}/... de cada usuario.
-- ============================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists avatars_select on storage.objects;
create policy avatars_select on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists avatars_own_insert on storage.objects;
create policy avatars_own_insert on storage.objects
  for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_own_update on storage.objects;
create policy avatars_own_update on storage.objects
  for update using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_own_delete on storage.objects;
create policy avatars_own_delete on storage.objects
  for delete using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
