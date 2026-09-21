-- Restaura el estado editorial "Descartado" (discarded), en rojo, como quinto y último estado:
--   Borrador · En revisión · Aprobado · Publicado · Descartado
--
-- Solo datos: una fila nueva en el lookup `statuses`. No cambia schema, RLS, grants ni constraints, y no toca
-- ninguna publicación ni ninguna otra fila del catálogo. La app no referencia keys de estado (todo va por id
-- desde `statuses`, ordenado por sort_order), así que el estado aparece solo en el formulario, drawer, cards,
-- filtros y CSV sin cambios de código.
--
-- Seguridad:
--   * Bloque DO único (atómico) e idempotente: si `discarded` ya existe, no hace nada.
--   * Aborta si el catálogo no es exactamente el esperado tras la simplificación (draft, in_review, approved,
--     published con sort_order 1..4), para no dejar un orden inconsistente.
--   * Color #EF4444: el mismo rojo que tenía el antiguo "Cancelado".
do $$
declare
  v_catalog text;
begin
  if exists (select 1 from public.statuses where key = 'discarded') then
    raise notice 'restore_discarded_status: ya existe "discarded", se omite.';
    return;
  end if;

  select string_agg(key || ':' || sort_order, ', ' order by sort_order) into v_catalog from public.statuses;
  if v_catalog is distinct from 'draft:1, in_review:2, approved:3, published:4' then
    raise exception 'restore_discarded_status: catálogo inesperado (%); abortado.', v_catalog;
  end if;

  insert into public.statuses (key, label, color, sort_order, is_default)
  values ('discarded', 'Descartado', '#EF4444', 5, false);

  raise notice 'restore_discarded_status: estado "Descartado" agregado (catálogo de 5 estados).';
end $$;
