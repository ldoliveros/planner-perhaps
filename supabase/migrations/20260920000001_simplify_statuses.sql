-- v1.2.1 — Simplifica los estados editoriales de 6 a 4:
--   idea + in_production -> draft (Borrador) · in_review (En revisión) · approved · published
--   cancelled se elimina (la auditoría previa confirmó 0 publicaciones canceladas).
--
-- Solo datos: no cambia schema, RLS ni constraints. El código no referencia keys de estado (todo va por id
-- desde el lookup `statuses`), así que no hace falta tocar la app.
--
-- Seguridad:
--   * Todo corre en un único bloque DO (atómico): si una guarda falla, no queda nada aplicado.
--   * Idempotente: si `draft` ya existe y `idea` / `in_production` / `cancelled` no, no hace nada.
--   * Aborta si los datos cambiaron desde la auditoría (estados inesperados o publicaciones `cancelled`).
--   * La fila `idea` se transforma en `draft` conservando su id (sus publicaciones no se tocan). Las
--     publicaciones `in_production` se reasignan a ese id.
--   * `updated_at` NO se modifica: la reasignación es técnica, no una edición editorial. set_updated_at()
--     pisa NEW.updated_at siempre, así que el trigger se deshabilita solo durante el UPDATE (dentro de la
--     misma transacción: si algo falla, el DISABLE se revierte) y se verifica que ningún timestamp cambió.
do $$
declare
  v_idea uuid;
  v_draft uuid;
  v_prod uuid;
  v_cancel uuid;
  v_unexpected text;
  v_missing text;
  v_cancelled_pubs integer;
  v_reassigned integer;
  v_ts_changed integer;
  v_statuses integer;
begin
  select id into v_idea from public.statuses where key = 'idea';
  select id into v_draft from public.statuses where key = 'draft';
  select id into v_prod from public.statuses where key = 'in_production';
  select id into v_cancel from public.statuses where key = 'cancelled';

  -- Ya migrada: nada que hacer.
  if v_idea is null and v_draft is not null and v_prod is null and v_cancel is null then
    raise notice 'simplify_statuses: ya aplicada, se omite.';
    return;
  end if;

  if v_draft is not null then
    raise exception 'simplify_statuses: estado inconsistente (existe "draft" junto con estados viejos); abortado.';
  end if;

  -- Deshabilita el trigger de updated_at (toma un lock que frena escrituras concurrentes sobre publications,
  -- así las guardas de abajo siguen siendo válidas hasta el final).
  alter table public.publications disable trigger publications_set_updated_at;

  -- Guardas: el catálogo debe ser exactamente el auditado.
  select string_agg(key, ', ') into v_unexpected
    from public.statuses
    where key not in ('idea', 'in_production', 'in_review', 'approved', 'published', 'cancelled');
  if v_unexpected is not null then
    raise exception 'simplify_statuses: estados inesperados en el catálogo (%); abortado.', v_unexpected;
  end if;

  select string_agg(k, ', ') into v_missing
    from unnest(array['idea', 'in_production', 'in_review', 'approved', 'published', 'cancelled']) as k
    where not exists (select 1 from public.statuses s where s.key = k);
  if v_missing is not null then
    raise exception 'simplify_statuses: faltan estados del catálogo auditado (%); abortado.', v_missing;
  end if;

  select count(*) into v_cancelled_pubs from public.publications where status_id = v_cancel;
  if v_cancelled_pubs > 0 then
    raise exception 'simplify_statuses: hay % publicaciones canceladas (la auditoría encontró 0); abortado.', v_cancelled_pubs;
  end if;

  -- Timestamps de referencia de las publicaciones que se reasignan.
  create temporary table _simplify_statuses_ts on commit drop as
    select id, updated_at from public.publications where status_id = v_prod;

  update public.publications set status_id = v_idea where status_id = v_prod;
  get diagnostics v_reassigned = row_count;

  select count(*) into v_ts_changed
    from public.publications p
    join _simplify_statuses_ts t on t.id = p.id
    where p.updated_at is distinct from t.updated_at;
  if v_ts_changed > 0 then
    raise exception 'simplify_statuses: % updated_at se modificaron; abortado.', v_ts_changed;
  end if;

  alter table public.publications enable trigger publications_set_updated_at;

  -- Catálogo final: idea -> draft (mismo id), colores actuales.
  update public.statuses set key = 'draft', label = 'Borrador', sort_order = 1, is_default = true where id = v_idea;
  update public.statuses set label = 'En revisión', sort_order = 2, is_default = false where key = 'in_review';
  update public.statuses set sort_order = 3, is_default = false where key = 'approved';
  update public.statuses set sort_order = 4, is_default = false where key = 'published';

  -- Ya sin referencias: el FK (sin ON DELETE) frenaría este DELETE si quedara alguna.
  delete from public.statuses where id in (v_prod, v_cancel);

  select count(*) into v_statuses from public.statuses;
  if v_statuses <> 4 then
    raise exception 'simplify_statuses: el catálogo final tiene % estados (se esperaban 4); abortado.', v_statuses;
  end if;

  raise notice 'simplify_statuses: % publicaciones reasignadas a draft, catálogo final de 4 estados.', v_reassigned;
end $$;
