-- Los calendarios dejan de ser mensuales: pasan a ser líneas editoriales
-- permanentes dentro de un cliente (ej: "General", "Cosmiatría", "GDL").
-- El período ahora lo determina publication_date en cada publicación.

alter table public.calendars add column if not exists slug text;

-- Backfill de slug para filas existentes (aproximado; el server-side slugify
-- de la app es el que genera slugs para filas nuevas).
update public.calendars
set slug = trim(both '-' from lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')))
where slug is null;

alter table public.calendars alter column slug set not null;

create unique index if not exists calendars_client_id_slug_uidx on public.calendars (client_id, slug);

-- month/year: sin datos reales en juego todavía (solo el calendario de
-- prueba), se eliminan directamente en vez de dejarlos nullable sin uso.
alter table public.calendars drop column if exists month;
alter table public.calendars drop column if exists year;
