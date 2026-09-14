-- Fase 4: el admin necesita poder listar/gestionar los profiles de usuarios
-- cliente (sección "Usuarios" en la ficha del cliente). Hasta ahora solo
-- existía profiles_select_own (cada usuario ve su propia fila).
drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());
