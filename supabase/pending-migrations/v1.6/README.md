# Planner v1.6 — migraciones y operación de base de datos

Rama: `feature/v1.6-collaboration`. **Producción (`mglbzsysgsdrsbqlovwd`) no tiene ninguna migración de v1.6.**
Cada paso de la tabla requiere autorización explícita.

**Estado al 2026-10-09:** F1, F1b y la migración de Trello están aplicadas **solo en el proyecto QA aislado**
`planner-qa-v16` (`wxkbkdoaohywqabmyqjk`, 32 migraciones), siempre con el guard
`supabase/qa/v1.6/qa-db.mjs`. F5 (worker y cron) sigue postergada: los archivos `000003`/`000004` continúan
en `pending-migrations/` y QA no tiene `pg_cron` ni `pg_net`.

## Archivos

| Archivo | Fase | Dónde vive | Qué hace |
|---|---|---|---|
| `supabase/migrations/20261008000001_v16_collab_core.sql` | F1 | migrations/ | Helpers, historial de estados + trigger, comentarios, menciones, auditoría, notificaciones, outbox (solo encola), RPCs, RLS, grants |
| `supabase/migrations/20261008000002_v16_realtime_publication.sql` | F1b | migrations/ (movida al aplicarla en QA) | Agrega `notifications`, `publication_comments`, `publication_status_events` a `supabase_realtime` (con guards: no FOR ALL TABLES, RLS activa, replica identity default/index) |
| `supabase/migrations/20261009000001_publications_trello_url.sql` | Trello | migrations/ | Columna `publications.trello_url` (nullable, sin default) + CHECK `https://(www.)trello.com/…` ≤ 2048. `cta`/`external_url` no se tocan |
| `pending-migrations/v1.6/20261008000003_v16_email_outbox_worker.sql` | F5 | pending | RPCs del worker (`claim/freeze/complete/fail/skip`), solo `service_role` |
| `pending-migrations/v1.6/20261008000004_v16_email_outbox_cron.sql` | F5 | pending | `cron.schedule('planner-email-outbox', '*/15 * * * *')` → Edge Function vía `pg_net` + Vault |
| `supabase/migrations/20261013000001_v16_comment_reads.sql` | Lecturas | migrations/ (aplicada SOLO en QA, 2026-10-12) | Comentarios no leídos por usuario: tabla `publication_comment_reads` (constancia por usuario y comentario; RLS solo propias) + RPCs `list_unread_publication_comments` (pendientes completos; desde la incorporación del usuario al cliente) y `mark_publication_comments_read` (ids mostrados). Pruebas: `qa/v1.6/security_checks_comment_reads.sql`; rollback: bloque CR. **Producción: aplicarla junto con F1 antes del deploy de v1.6** |
| `supabase/migrations/20261014000001_v16_comment_replies.sql` | Respuestas | migrations/ (aplicada SOLO en QA, 2026-10-13) | `publication_comments.reply_to_comment_id` (FK on delete set null, CHECK no-self, trigger misma publicación) + `add_publication_comment` con `p_reply_to` opcional (firma de 5 args; llamadas existentes siguen funcionando). Rollback: bloque RP |
| `supabase/migrations/20261014000002_v16_comment_reactions.sql` | Reacciones | migrations/ (aplicada SOLO en QA, 2026-10-13) | Tabla `publication_comment_reactions` (PK comentario+usuario+emoji, CHECK 6 emojis, alcance derivado del comentario por trigger, quitar = `active false`) + RPC `set_comment_reaction` (En revisión/Aprobada/Publicada, no eliminados, acceso del cliente) + Realtime con guardas. Rollback: bloque RX |
| `qa/v1.6/security_checks_replies_reactions.sql` | — | fuera de migrations | Pruebas RP01–RP08 y RX01–RX15 (ROLLBACK). Dry-run: `qa-db.mjs dry-run-replies-reactions` |
| `supabase/migrations/20261015000001_v16_publications_realtime.sql` | Publicaciones en vivo | migrations/ (aplicada SOLO en QA, 2026-10-13) | Agrega `public.publications` a `supabase_realtime` (guardas: no FOR ALL TABLES, RLS activa, replica identity DEFAULT). Sin cambios de tablas, políticas ni datos. Rollback: bloque RT (y A5) |
| `pending-migrations/v1.6/20261016000001_v16_drop_publications_internal_notes.sql` | Retiro de Notas internas | pending (sin dry-run). Versión ANTERIOR a las ya aplicadas en QA: al moverla, `db push` exige `--include-all` | `alter table publications drop column internal_notes`. Guardas: aborta si alguna fila tiene notas o si algo de la base usa la columna. Irreversible para los datos; compatible con v1.5.1. Después de aplicarla, quitar `internal_notes` de `lib/supabase/database.types.ts`. Rollback: bloque IN (columna vacía) |
| `supabase/migrations/20261017000001_v16_publication_archive.sql` | Archivados | migrations/ (aplicada SOLO en QA, 2026-10-13) | `publications.archived_at` / `archived_by`; archivada = solo lectura (trigger) y sin comentarios/reacciones nuevos; RLS: el Client User no ve archivadas ni sus comentarios, historial, reacciones, destinos ni assets. Pruebas: `qa/v1.6/security_checks_archive.sql`. Rollback: bloque AR |
| `supabase/migrations/20261017000002_v16_publication_changes.sql` | Avisos de cambios por cliente | migrations/ (aplicada SOLO en QA, 2026-10-13) | Tabla `publication_changes` (avisos upsert/delete por cliente, RLS `can_view_client`, limpieza a 1 día) + trigger AFTER en `publications` (protegido: nunca bloquea un guardado) + Realtime: publica los avisos y **deja de publicar `publications`** (sin ids de otros clientes en DELETE). Rollback: bloque PC |
| `supabase/migrations/20261018000001_v16_pause_collab_emails.sql` | Pausa de emails de colaboración | migrations/ (aplicada SOLO en QA, 2026-10-14) | Flag `v16_collab_emails` (APAGADO) + `collab_emails_enabled_for(client)` + `create or replace` de `enqueue_comment_digest` y `request_status_email` (cuerpo del core + salida temprana; grants conservados; sin triggers sobre el outbox). Comentarios, menciones, respuestas, ediciones y `request_status_email` no encolan nada; notificaciones internas, reacciones, lecturas y estados sin cambios. F5 = encender el flag. Pruebas: `security_checks_collab_emails.sql` (EM01–EM10) e `integration_collab_emails_paused.sql` (IT01–IT12). Rollback: bloque EM. **10.ª migración de producción** |
| `qa/v1.6/security_checks_archive.sql` | — | fuera de migrations | Pruebas AR01–AR09 y PC01–PC08 (ROLLBACK). Dry-run: `qa-db.mjs dry-run-archive` |
| `supabase/rollback/v1.6/rollback_v16.sql` | — | fuera de migrations | Rollback por niveles (0 = emergencia sin pérdida de datos … 4 = revertir core) |
| `supabase/qa/v1.6/security_checks.sql` | — | fuera de migrations | Pruebas de aislamiento entre clientes/roles, en `BEGIN … ROLLBACK` |

Los archivos en `pending-migrations/` se mueven a `supabase/migrations/` recién cuando se autoriza ese
paso, así un `supabase.cmd db push` nunca aplica Realtime/worker/cron por arrastre.

## Orden de aplicación (cada paso con autorización)

1. **F1 core**: `supabase.cmd db push`. Hoy aplica, en orden, `20261008000001`, `20261008000002` y
   `20261009000001` (las tres que están en migrations/); revisar con `--dry-run` que no haya otras. Verificar:
   v1.5.1 sigue guardando y cambiando estados; Security Advisor sin warnings nuevos; `security_checks.sql` → `OK`.
2. **F1b Realtime**: ya está en migrations/ (se aplica junto con F1 en el mismo push).
2b. **Trello** (`20261009000001`): **obligatoria antes del deploy de v1.6** — la app de v1.6 escribe
   `trello_url` y, sin la columna, cada guardado de publicación falla. Es independiente del flag y compatible
   con v1.5.1 (que lee con `select *` e ignora la columna).
3. **F5 worker**: mover `000003`, push. Desplegar Edge Function `email-outbox` (`verify_jwt = false`,
   igual que `daily-agenda`) y probarla a mano con destinatarios QA.
4. **F5 cron**: crear en Vault `planner_project_url` y `planner_email_outbox_key` (Dashboard), mover
   `000004`, push.

## Activación (flag `v16_notifications`)

F1 crea `planner_feature_flags` con la fila `v16_notifications` en **false**. Mientras siga así:
- El historial de estados (`publication_status_events`) se registra igual en cada cambio de estado.
- Ni el trigger ni las RPCs crean notificaciones internas ni encolan emails; `request_status_email` responde
  "Los avisos por email de v1.6 todavía no están activos" (el cambio de estado ya quedó guardado).
- Los comentarios se pueden crear (solo v1.6 los usa), pero no notifican.

Así, aplicar F1 con v1.5.1 en producción no acumula notificaciones. Cambios de estado del flag (SQL Editor, 🔒):
- QA (solo QA Sandbox): `update planner_feature_flags set client_ids = array[(select id from clients where slug='qa-sandbox')] where key='v16_notifications';`
- Lanzamiento: `update planner_feature_flags set enabled = true where key='v16_notifications';`
- Apagado (rollback A0): `update planner_feature_flags set enabled = false, client_ids = '{}' where key='v16_notifications';`

El flag no toca `publications`: solo decide si, además del evento, se insertan notificaciones / filas de outbox.
El worker (F5) también lo revisa y descarta (`skipped/notifications_disabled`) lo encolado si se apaga.

## Compatibilidad con v1.5.1

- Solo `create`; ningún `alter/drop` sobre objetos existentes. Policies, grants y datos previos intactos.
- Único contacto: trigger `AFTER INSERT OR UPDATE OF status_id` en `publications`. Inserta el evento
  (estricto) y notificaciones (sub-bloque `EXCEPTION → WARNING`: nunca bloquea un guardado).
- v1.5.1 no lee las tablas nuevas; el aviso de aprobado de v1.5.1 sigue funcionando igual. Cuando la
  app v1.6 lo pase al outbox, el worker sigue escribiendo `publication_client_notifications`.
- El Client User no gana permisos de escritura directos: solo RPCs que validan cliente, estado y rol.

## Outbox: cron cada 15 min y concurrencia

- **Ventana**: una fila `pending` por destinatario + publicación (índice único parcial).
  `send_after = primer evento + 15 min`, fija. Con el cron cada 15 min: envío entre **15 y 30 min**.
- **Revisión / aprobación**: `send_after = now()`, fila propia por destinatario (no se agrupan). La app
  dispara el worker apenas encola; si ese disparo falla, el cron lo envía en ≤ 15 min.
- **Pendiente vs. en procesamiento**: el encolado toma la ventana con `SELECT … FOR UPDATE`; el worker la
  reclama con `FOR UPDATE SKIP LOCKED`. Si el worker reclama primero, el encolado re-evalúa
  `status = 'pending'`, no la encuentra y abre una ventana nueva: nunca se agrega un comentario a un
  email que ya se está enviando. Si el encolado bloquea primero, el worker la saltea y la toma en el
  siguiente tick.
- **Reintentos** en estado `retry` (no `pending`): no chocan con la ventana abierta siguiente. Backoff
  5/15/45/120 min (efectivamente redondeado al tick), máx. 5 intentos, < 24 h.
- **Idempotencia**: `Idempotency-Key: planner-outbox-<id>` constante + HTML congelado en el primer
  intento (`freeze_email_outbox_render`), porque Resend devuelve 409 si la key se reusa con otro payload.
  Pedidos de la app: `(request_id, recipient_id)` único. Comentarios: `(author_id, request_id)` único.
- **Corridas concurrentes** (cron + disparo inmediato): `SKIP LOCKED` → nunca la misma fila dos veces.
  Filas `processing` colgadas > 10 min se reclaman; sin intentos restantes → `failed`.
- **Revalidación al enviar**: destinatario activo y miembro del cliente; ítems no eliminados y sin
  comentarios propios; avisos de estado solo a Client Users. Si no queda nada → `skipped`.
- **Vencimiento**: filas no enviadas tras 24 h → estado `expired` (registradas con intentos y último error; nunca se borran). Cubre lo encolado antes de F5.

## Decisiones técnicas tomadas en esta preparación

1. Participantes = autores de comentarios no eliminados + último actor que envió a revisión.
2. Envío a revisión → campanita solo a Client Users. Aprobación del cliente → staff asignado.
   Aprobación de la agencia → campanita a Client Users (`approved_by_agency`); el email sigue opcional.
3. Editar y eliminar comentarios: solo en `in_review` (igual que comentar).
4. Mencionar en una edición notifica solo a las menciones nuevas; las sacadas no generan nada.
5. Notificación sin extracto del comentario (un comentario eliminado no deja texto en la bandeja).
6. Nombre visible sin email: `full_name` o "Equipo Perhaps" / "Cliente".
7. Comentario: máx. 5000 caracteres.
