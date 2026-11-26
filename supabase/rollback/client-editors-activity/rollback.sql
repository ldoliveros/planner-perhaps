-- Reversión de 20261126000002_client_publication_editors (bloque CE) y 20261126000003_publication_activity (bloque PA).
--
-- Ninguna de las dos migraciones reemplaza objetos existentes: solo AGREGA tablas, funciones, triggers y políticas
-- (aditivas: las de staff y las del Client User lector quedan intactas). Revertir = borrar lo agregado. No hay
-- definiciones previas que restaurar (snapshot de verificación: rollback/client-editors-activity/README.md).
--
-- Orden: PA primero (la app nueva lee publication_activity; con la app anterior publicada no se usa), después CE.
-- Pérdida de datos al revertir: los eventos de actividad registrados y la lista de editores (los usuarios quedan
-- como Lectores). Las publicaciones creadas o editadas por editores NO se tocan.
-- Ejecutar en el SQL Editor del proyecto, un bloque por vez.

-- ============================================================
-- PA — actividad de publicaciones
-- ============================================================
-- begin;
alter publication supabase_realtime drop table public.publication_activity;
drop trigger if exists publications_activity on public.publications;
drop trigger if exists publication_destinations_activity on public.publication_destinations;
drop trigger if exists publication_assets_activity on public.publication_assets;
drop function if exists public.log_publication_activity();
drop function if exists public.log_publication_destinations_activity();
drop function if exists public.log_publication_assets_activity();
drop function if exists public.record_publication_activity(uuid, uuid, jsonb);
drop table if exists public.publication_activity;
-- commit;

-- ============================================================
-- CE — permiso Editor del Client User
-- ============================================================
-- begin;
drop policy if exists thumbnails_client_editor_insert on storage.objects;
drop policy if exists thumbnails_client_editor_update on storage.objects;
drop policy if exists thumbnails_client_editor_delete on storage.objects;
drop policy if exists publication_assets_client_editor_insert on public.publication_assets;
drop policy if exists publication_assets_client_editor_update on public.publication_assets;
drop policy if exists publication_assets_client_editor_delete on public.publication_assets;
drop policy if exists publication_destinations_client_editor_insert on public.publication_destinations;
drop policy if exists publication_destinations_client_editor_delete on public.publication_destinations;
drop policy if exists publications_client_editor_insert on public.publications;
drop policy if exists publications_client_editor_update on public.publications;
drop trigger if exists publications_client_editor_guard on public.publications;
drop function if exists public.guard_client_editor_publication_write();
drop function if exists public.is_client_publication_editor(uuid);
drop table if exists public.client_publication_editors;
-- commit;

-- Después de revertir: delete from supabase_migrations.schema_migrations where version in ('20261126000002','20261126000003');
-- solo si se quiere volver a aplicarlas más adelante con `db push`.
