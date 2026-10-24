# Propuesta — Archivar publicaciones (v1.6)

Estado: **implementada en el código (2026-10-13); migraciones `20261017000001`/`20261017000002` pendientes de aplicar.** Antes:
**propuesta en revisión** (decisiones de producto aprobadas el 2026-10-13: independiente del estado editorial;
fuera del Planner y de las estadísticas; staff restaura o elimina definitivamente; el Client User no accede ni por
consultas directas → filtro en la RLS; Archivar con toast "Deshacer" sin confirmación; Eliminar definitivamente con
confirmación; si entra en v1.6, `daily-agenda` las excluye). Sin código, sin SQL, sin migraciones.

## 1. Modelo de datos y migración
Migración `2026101600000X_v16_publication_archive.sql` (pending, con guardas como las anteriores):

```sql
alter table public.publications
  add column archived_at timestamptz,                                         -- null = activa
  add column archived_by uuid references public.profiles (id) on delete set null;
create index publications_active_client_date_idx
  on public.publications (client_id, publication_date) where archived_at is null;
```
- **Independiente del estado editorial**: no toca `status_id`; una publicación Descartada puede estar o no archivada.
- Restaurar = `archived_at = null`: conserva fecha, estado, contenido, destinos, assets, comentarios, reacciones,
  historial y lecturas (nada se borra ni se mueve).
- `archived_at` cambia `updated_at` (trigger existente): un editor abierto en otra sesión recibe el conflicto de
  versión al guardar — no hay sobrescritura silenciosa.

## 2. Permisos y RLS
- **Archivar / restaurar**: solo staff con `can_manage_client` (la policy `publications_manage` ya lo permite como
  UPDATE). Server actions con UPDATE condicional (`updated_at` / estado esperado, mismo patrón que
  `setPublicationStatus`); 0 filas = error explícito.
- **Client User**: no ve archivadas. Recomendado en la base, no solo en la UI: `publications_select_own` pasa a
  `client_id = current_client_id() and archived_at is null` (cambio de policy → requiere autorización explícita).
  Staff sigue viéndolas (las necesita para el listado de archivadas).
- **Eliminar definitivamente**: reutiliza `deletePublication` (mismos permisos y limpieza de Storage).
- Comentarios/reacciones de una archivada: sin cambios de RPC; como sale del Planner, no hay dónde escribir. Un
  enlace `/p/<id>` a una archivada: staff → abre el listado de archivadas con esa publicación; Client User → "No
  disponible" (la RLS ya no la devuelve).

## 3. Impacto en lecturas (todas filtran `archived_at is null` salvo el listado de archivadas)
| Lugar | Cambio |
|---|---|
| Planner de cliente / "Ver todos" / portal (`listPublicationsForClient`, `listPublicationsInRange`, `fetchPublicationsInRange`) | Excluir archivadas |
| Filtros, búsqueda, chips | Sin cambios (operan sobre lo ya cargado) |
| Escritorio: KPI, distribución, redes, próximas publicaciones | Excluir archivadas (también con "Mostrar descartadas") |
| Exportar CSV | Excluir archivadas (exporta lo visible) |
| Conteos en Clientes / Calendarios (`app/admin/clients`, `app/admin/calendars`) | Contar solo activas; el borrado de calendarios/clientes sigue contando todas (no se puede borrar algo con archivadas) |
| Notificaciones existentes | Se conservan; abrir una de una archivada sigue la regla de `/p/<id>` |
| **Edge Function `daily-agenda`** (`supabase/functions/daily-agenda/agenda.ts`) | Excluir archivadas — **hay que redeployarla con v1.6** (la de v1.5.1 no conoce la columna y las incluiría) |

## 4. Realtime y conflictos
- Archivar/restaurar es un UPDATE de `publications`: con `20261015000001` (publicaciones en vivo) las demás sesiones
  releen la publicación; si viene archivada, la quitan de la lista (y del listado de archivadas al restaurar).
- Si estaba abierta en otra sesión: se cierra la vista con "Esta publicación fue archivada por otro usuario" (mismo
  mecanismo que la eliminación).
- Archivar desde el menú de la tarjeta con UPDATE condicional: si otro la cambió, error claro ("cambió mientras
  tanto") en vez de archivar una versión vieja.

## 5. UI (minimalista)
- **Archivar** junto a **Eliminar**: en el menú `•••` de la tarjeta y en el pie del editor. Sin confirmación modal
  (es reversible); toast "Publicación archivada" con acción **Deshacer**.
- **Menú `•••` del encabezado del Planner** (junto a Exportar CSV): "Publicaciones archivadas (N)" → panel lateral
  (Sheet, como la campanita): lista compacta por fecha con título, fecha, estado (StatusPill), "Archivada el … por …"
  y, en "Ver todos", el cliente. Acciones por fila: **Restaurar** y **Eliminar definitivamente** (con la
  confirmación de siempre). Estado vacío: "No hay publicaciones archivadas".
- Client User: sin la opción (no ve archivadas).

## 6. Compatibilidad y rollback
- v1.5.1 ignora las columnas nuevas (`select *`), pero **no filtra archivadas**: si se vuelve a v1.5.1 con
  publicaciones archivadas, reaparecen en su Planner (los datos están intactos). Mitigación documentada en
  `ROLLBACK.md`: antes de un rollback a v1.5.1, restaurar o revisar las archivadas (consulta de conteo en A6).
- Bloque de rollback parcial **AR**: restaurar la policy original de Client User, `drop index`, `drop column
  archived_by`, `drop column archived_at` (pierde solo la marca de archivado: las publicaciones vuelven a verse).
- Pruebas de seguridad (ROLLBACK): Client User no ve archivadas (incluido `/p/<id>`); AM solo archiva/restaura de sus
  clientes; archivar no cambia estado ni borra comentarios/reacciones; restaurar conserva todo.

## Decisiones necesarias
1. ¿Filtrar archivadas para Client User en la RLS (recomendado) o solo en la aplicación?
2. ¿Archivar con "Deshacer" (sin confirmación) o con confirmación?
3. Confirmar que el redeploy de `daily-agenda` entra en el deploy de v1.6.

## Ajustes requeridos (revisión 2026-10-13)

### Por Realtime de publicaciones (`20261015000001`, aplicada en QA)
- `usePublicationsLive.onChanged` hoy hace upsert de lo que devuelve `fetchPublicationForView`. El staff SÍ puede leer
  archivadas (las necesita para el listado), así que hay que tratar `archivedAt != null` como **quitar** del Planner y,
  si estaba abierta en otra sesión, cerrarla con "Esta publicación fue archivada por otro usuario" (mismo mecanismo que
  la eliminación). Restaurar llega como UPDATE → vuelve a aparecer.
- **Client User**: con el filtro en la RLS (`archived_at is null`), al archivar la fila deja de pasar su RLS y
  Realtime **no le envía** ese UPDATE: su Planner abierto seguiría mostrando la publicación hasta recargar (y al abrirla
  no la encontraría). Opciones: (a) aceptar el desfase hasta recargar/volver a la pestaña, o (b) la tabla de señales
  `publication_changes` de `PROPUESTA_seguridad_publicaciones.md` (RLS por cliente, no por archivado), que resuelve
  esto y además elimina la exposición de ids en DELETE. Recomendado: decidir junto con esa propuesta.
- El listado de archivadas (staff) también se actualiza en vivo con los mismos eventos.

### Por el retiro de Notas internas (`20261016000001`, pendiente)
- Ningún ajuste funcional: la propuesta no usa `internal_notes`. El listado de archivadas muestra título, fecha,
  estado, cliente (en "Ver todos") y "Archivada el … por …"; Restaurar conserva el resto de los datos existentes.
- La migración de Archivados va DESPUÉS de `20261016000001` (versión mayor) y no debe recrear la columna.
