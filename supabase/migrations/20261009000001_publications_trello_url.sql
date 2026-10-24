-- v1.6 — "Link a Trello" por publicación (PROPUESTA: pendiente de autorización; no aplicar sin aprobación).
--
-- Columna nueva, nullable y sin default: en PostgreSQL 11+ es un cambio solo de catálogo (no reescribe la tabla).
-- `cta` y `external_url` NO se tocan: sus datos se conservan aunque la interfaz de v1.6 deje de mostrarlos.
-- Compatibilidad con v1.5.1: lee publicaciones con `select *` y su mapper ignora columnas desconocidas; nunca
-- escribe `trello_url`. Permisos: los grants de `publications` son a nivel tabla, la columna los hereda; las
-- políticas RLS son por fila, no cambian. `publications` no está en la publicación de Realtime.
--
-- Guard: sin IF NOT EXISTS a propósito — si la columna o el constraint ya existen, la migración falla y no
-- cambia nada (corre en una transacción).
--
-- Rollback (solo si todavía no hay datos que conservar):
--   alter table public.publications drop constraint publications_trello_url_check;
--   alter table public.publications drop column trello_url;

alter table public.publications
  add column trello_url text;

-- Solo enlaces https de Trello (tarjetas o tableros) y largo razonable. La columna arranca toda en NULL, así que
-- validar el constraint es inmediato. La app valida lo mismo antes de guardar (mensaje claro al usuario).
alter table public.publications
  add constraint publications_trello_url_check
  check (trello_url is null or (char_length(trello_url) <= 2048 and trello_url ~* '^https://(www\.)?trello\.com/'));

comment on column public.publications.trello_url is
  'v1.6: link a la tarjeta de Trello de la publicación (opcional). Reemplaza en la interfaz a CTA/URL, que se conservan.';
