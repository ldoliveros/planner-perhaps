-- RLS por sí sola no alcanza: Postgres exige el GRANT de la tabla ANTES de
-- evaluar las policies. Sin esto, PostgREST devuelve 42501 "permission denied"
-- para cualquier usuario autenticado, incluso con policies correctas.
-- RLS sigue siendo la barrera real de autorización — este GRANT solo habilita
-- que la consulta llegue a evaluarse.
grant usage on schema public to authenticated;

grant select, insert, update, delete on
  public.clients,
  public.profiles,
  public.calendars,
  public.platforms,
  public.account_types,
  public.content_types,
  public.statuses,
  public.publications,
  public.publication_destinations,
  public.publication_assets
to authenticated;
