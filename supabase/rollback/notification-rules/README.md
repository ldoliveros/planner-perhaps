# Reglas de notificaciones — despliegue y reversión

Migración: `20261126000004_notification_rules.sql` (una sola, transaccional).

- Columnas nuevas en `notifications`: `details` (fecha nueva / motivo de invalidación) y `suppressed_at` (avisos de
  publicaciones archivadas fuera de pendientes, sin marcarlos leídos). Tipos nuevos: `reply`, `published`, `discarded`,
  `rescheduled`, `approval_invalidated`, `created_by_client`.
- Reemplaza (`create or replace`, misma firma y grants) `fan_out_comment`, `log_publication_status_change` (solo deja la
  auditoría; los avisos de estado pasan a `notify_publication_change`) y `approve_publication_as_client` (habilita su
  propio UPDATE frente a la regla nueva). Recrea el trigger `publications_status_event` sin `of status_id`.
- Agrega triggers `publications_approval_rules` (BEFORE: aprobación del cliente solo por la RPC con versión; contenido
  aprobado modificado → En revisión), `publications_notify` (AFTER: avisos agrupados por guardado),
  `publication_destinations_content_changed` y `publication_assets_content_changed` (nueva versión / invalidación) y la
  RPC `mark_publication_notifications_read(uuid, text[], timestamptz)`.
- Backfill: suprime los avisos pendientes de publicaciones que ya estaban archivadas.

Orden: migración → app → `daily-agenda` (el conteo de pendientes excluye `suppressed_at`; con la base anterior cae a
`read_at` solo). La app nueva sin la migración no funciona (lee `details`/`suppressed_at`): no publicarla antes.

Compatibilidad con la app anterior: los avisos nuevos usan tipos que la app anterior muestra como "Novedades en «…»"; un
Cliente Editor de la app anterior que elija Aprobada en el formulario recibe el error de la base (debe usar el botón).

Reversión (en este orden):
1. Netlify: publicar el deploy anterior de la app.
2. `daily-agenda`: no hace falta revertirla (tolera la base sin `suppressed_at`).
3. Base: `rollback.sql` (transaccional). Borra las notificaciones de los tipos nuevos y las dos columnas; restaura las
   tres funciones y el trigger de 20261008000001. Comentarios, estados, actividad y publicaciones no se tocan.

Ensayo real en QA (hecho): `node supabase/qa/v1.6/qa-db.mjs revert-notification-rules --confirm wxkbkdoaohywqabmyqjk`
y después `push` de nuevo.

Pruebas (QA, revertidas): `node supabase/qa/v1.6/qa-db.mjs security-checks --suite notification-rules --confirm wxkbkdoaohywqabmyqjk`
