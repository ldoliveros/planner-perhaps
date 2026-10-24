# Rollback de Planner v1.6 → v1.5.1

Procedimiento preparado, **no ejecutado**. Cada paso requiere autorización explícita. El rollback
predeterminado **no borra tablas ni datos**: desactiva v1.6 y deja todo listo para re-activarlo.

## 0. Referencias exactas de v1.5.1

| Qué | Valor |
|---|---|
| Rama estable | `main` (= `origin/main`), sin cambios de v1.6 |
| Commit desplegado esperado | `e70582a048e175abd0a3013156c1be2af5f0bafd` — "chore: update v1.5.1 release metadata" (2026-09-29 07:44 -03) |
| Tag `v1.5.1` | `530b9760d2762c1f595363aa820e899f1a5468ab` — "fix: polish Planner UX for v1.5.1". `e70582a` solo agrega metadata (`lib/changelog.ts`, `lib/version.ts`) encima del tag |
| Producción | https://planner.perhaps.com.ar (Netlify, build desde `main`) |
| Migraciones de v1.6 (en `supabase/migrations/`, aplicadas en QA: 39 en total) | `20261008000001` (core) · `20261008000002` (Realtime) · `20261009000001` (Trello) · `20261013000001` (comentarios no leídos) · `20261014000001` (respuestas) · `20261014000002` (reacciones) · `20261015000001` (publicaciones en vivo) · `20261017000001` (archivado) · `20261017000002` (avisos por cliente) · `20261018000001` (pausa de emails de colaboración) |
| Migraciones de v1.6 postergadas (en `pending-migrations/`, no aplicadas en ningún proyecto) | `20261008000003` (worker) · `20261008000004` (cron) · `20261016000001` (retiro de Notas internas) |

**Deploy de Netlify de v1.5.1 (destino exacto del rollback, registrado 2026-10-24):** Deploy ID
`6abb97a46de2fd000848f952`, commit `e70582a`, sitio `planner.perhaps.com.ar`. Auto publishing: **activado** (un push a
`main` publica solo; en un rollback, después de "Publish deploy" de este ID, hacer "Stop auto publishing").

## 1. Orden del rollback (predeterminado, sin pérdida de datos)

0. **Publicaciones archivadas (antes de publicar v1.5.1):** contar y exportar la lista
   (`select id, client_id, title, publication_date, archived_at, archived_by from public.publications where archived_at
   is not null;`). Con v1.5.1 publicada y las columnas conservadas: el **staff las vuelve a ver** (v1.5.1 no filtra
   archivadas) pero **no puede editarlas ni cambiarles el estado** (trigger `publications_archived_readonly`: "restaurala
   para modificarla", y v1.5.1 no tiene Restaurar); sí puede eliminarlas. El **Client User sigue sin verlas** (la RLS de
   `20261017000001` queda). La agenda diaria las sigue excluyendo si la función desplegada es la de v1.6 (no volver a
   desplegar la de v1.5.1). Opciones, a decidir con la lista en mano: (a) **dejarlas así** (predeterminado: no expone
   nada al cliente, solo molestia visual para el staff); (b) restaurarlas con
   `update public.publications set archived_at = null, archived_by = null where archived_at is not null;` (vuelven a
   ser visibles y editables **también para el Client User**); (c) bloque AR (mismo efecto que b, y además quita las
   columnas). b y c exponen al cliente contenido que se había archivado: solo con autorización explícita.
1. **Netlify — volver al deploy de v1.5.1 (primero, minutos):**
   Netlify → *Deploys* → deploy de producción con commit `e70582a` → **Publish deploy**. Es instantáneo y no
   recompila. Inmediatamente después: *Deploys* → **Stop auto publishing**, para que un push posterior a
   `main` no vuelva a publicar v1.6 por accidente (reactivarlo recién cuando `main` esté en el estado deseado).
   Alternativa sin Netlify UI: revertir en git el merge de v1.6 sobre `main` y desplegar (requiere push).
2. **Supabase — bloque A de `rollback_v16.sql`** (SQL Editor, como postgres):
   - A0 flag `v16_notifications` apagado (deja de notificar y de encolar emails al instante) · A1 cron fuera ·
     A2 cola cancelada (no borrada) · A3 trigger deshabilitado · A4 RPCs de v1.6 sin EXECUTE para
     `authenticated` (core + lecturas + `add_publication_comment` de 4 o 5 argumentos + reacciones; las de firma
     variable, con `to_regprocedure`) · A5 (opcional) tablas fuera de Realtime (incluida la de reacciones).
   - A6: verificar `flag_enabled = false`, `flag_client_ids = {}`, `trigger_state = 'D'`, `cron_jobs = 0`,
     `outbox_pending = 0`, `v16_rpc_grants = 0` (cuenta las 11 RPCs de usuario de v1.6). Sin `pg_cron` instalado
     (proyecto QA) `cron_jobs` da 0 sin error.
3. **Edge Function `email-outbox`** (si se desplegó): no hace falta borrarla. Sin cron no corre; si alguien la
   invoca, no encuentra filas pendientes. Para cortarla del todo: quitar el secret `RESEND_API_KEY` solo de
   esa función no es posible (los secrets son por proyecto y `daily-agenda` lo usa) → dejarla sin invocar.
4. **Verificación funcional** (sección 3) con los usuarios QA.
5. **Avisar a usuarios con pestañas abiertas**: una pestaña con v1.6 ya cargada sigue llamando Server Actions
   que v1.5.1 no tiene → errores hasta recargar. Pedir recarga (o esperar el banner de versión de v1.5.1, que
   solo aparece si `last_seen_version` difiere).

Orden pensado así: Netlify primero (corta la UI nueva), SQL después (corta los efectos en la base). Si el
problema es de la base (p. ej. el trigger), hacer **A3 primero**: deshabilitarlo protege a v1.5.1 al instante.
Si el problema son solo notificaciones o emails (p. ej. envíos de más), alcanza con **A0** (+ A1/A2): la app v1.6
puede quedar publicada.

**Ensayo:** el procedimiento completo se ensaya primero en el proyecto aislado (QA_STRATEGY.md §B11): primero en una
transacción que se revierte (sin persistencia), después —con autorización aparte— de verdad, con smoke de v1.5.1
y re-activación con el bloque R.

## 2. Qué se conserva y qué se desactiva

| Objeto | Rollback predeterminado | Motivo |
|---|---|---|
| Tablas `publication_comments`, `publication_comment_mentions`, `publication_comment_revisions` | **Se conservan** | Historial y auditoría de comentarios; v1.5.1 no las lee |
| `publication_status_events` | **Se conserva** | Registro de aprobaciones (quién, rol, fecha) |
| `notifications` | **Se conserva** | Bandeja; antes de re-activar v1.6 conviene marcar leídas las acumuladas |
| `email_outbox`, `email_outbox_items` | **Se conservan** (pendientes → `cancelled`) | Auditoría de envíos |
| `planner_feature_flags` (fila `v16_notifications`) | **Se conserva**, con `enabled = false` y `client_ids = {}` | Interruptor de notificaciones; re-activar = un UPDATE |
| Trigger `publications_status_event` | **Deshabilitado** (no borrado) | Único punto que toca el flujo de v1.5.1 |
| RPCs de escritura de v1.6 | **Sin EXECUTE** para `authenticated` | Cierra la API nueva sin borrar código SQL |
| Helpers (`is_active_user`, etc.) y RPCs del worker | Se conservan | Ya sin EXECUTE para usuarios desde su creación |
| Job de cron | **Eliminado** (`cron.unschedule`) | Se recrea re-aplicando la migración 000004 |
| Publicación Realtime | Opcional: tablas fuera | Inocuo si se deja |
| Columnas `publications.archived_at` / `archived_by` (20261017000001) | **Se conservan** en el bloque A | v1.5.1 las ignora (`select *`) pero **no filtra archivadas**: con v1.5.1 publicada, las archivadas se ven. Antes de volver a v1.5.1, restaurar o revisar las archivadas |
| Columna `publications.internal_notes` | Retirada por `20261016000001` (si se aplicó); un rollback NO la recupera con datos | v1.5.1 funciona sin ella (lee con `select *`, nunca la escribe) |
| Columna `publications.trello_url` (+ CHECK) | **Se conserva** | v1.5.1 la ignora (lee con `select *`, nunca la escribe); `cta`/`external_url` nunca se dejaron de conservar |
| `publication_comment_reads` (20261013000001) | **Se conserva**; sus RPCs sin EXECUTE | Constancias de lectura; v1.5.1 no las usa |
| `publication_comments.reply_to_comment_id` + trigger de misma publicación (20261014000001) | **Se conservan** | Solo los usa v1.6; `add_publication_comment` queda sin EXECUTE |
| `publication_comment_reactions` (20261014000002) | **Se conserva**; `set_comment_reaction` sin EXECUTE; opcional fuera de Realtime (A5) | Reacciones; v1.5.1 no las usa |
| Bloque Z (DROP de todo) | **No** | Destructivo; solo con decisión aparte y export previo |

Re-activación: bloque R de `rollback_v16.sql`.

## 2b. Revisión del bloque A (compatibilidad con v1.5.1 y datos)

| Paso | Qué modifica | ¿Borra datos? | ¿Afecta a v1.5.1? |
|---|---|---|---|
| A0 flag off | 1 fila de configuración (`planner_feature_flags`) | No | No (v1.5.1 no la lee) |
| A1 cron fuera | Borra el **job** en `cron.job` (configuración, no datos de Planner); se recrea re-aplicando `000004` | No | No |
| A2 cola cancelada | Cambia `status` de filas pendientes a `cancelled` (se conservan con su historial). Lo cancelado no se reenvía solo: es la única pérdida funcional (avisos que no saldrán) | No | No |
| A3 trigger deshabilitado | Catálogo (`tgenabled = 'D'`); toma un lock breve sobre `publications` | No | Sí, para bien: v1.5.1 vuelve a escribir publicaciones exactamente como antes de F1 |
| A4 revoke EXECUTE | Privilegios de las 11 RPCs de usuario de v1.6 (las de lecturas, respuestas y reacciones, solo si existen) | No | No: v1.5.1 no las llama |
| A5 Realtime | Publicación lógica `supabase_realtime` | No | No: v1.5.1 no se suscribe |
| A6 | Solo lectura | — | — |

Ningún paso toca `publications`, `calendars`, `clients`, `profiles`, `user_client_assignments`, sus policies ni
sus grants. Borde conocido: una fila que el worker esté enviando en ese instante (A2 la pasa a `cancelled`) puede
salir igual y quedar registrada como cancelada.

## 2c. Rollbacks parciales (sin desactivar todo v1.6)

Para revertir UNA funcionalidad nueva dejando el resto de v1.6 activo. Cada bloque es independiente, va en una
transacción (`begin … commit`) y borra la entrada correspondiente de `supabase_migrations.schema_migrations`.

| Bloque | Revierte | Pierde | Orden / dependencias | Frontend v1.6 publicado después |
|---|---|---|---|---|
| **CR** | `20261013000001` (comentarios no leídos) | Solo las constancias de lectura | Independiente | La pestaña Comentarios queda sin contador (no falla) |
| **RX** | `20261014000002` (reacciones) | Solo las reacciones | Saca la tabla de Realtime antes del `drop` | No muestra reacciones. Pestañas abiertas que ya conocían la tabla pierden el vivo de comentarios hasta recargar |
| **RP** | `20261014000001` (respuestas) | Solo las referencias "en respuesta a" | Recrea `add_publication_comment` de 4 argumentos (idéntica a la del core) **antes** de quitar la columna, porque la de 5 la usa | Publica sin referencia (lee con las columnas base); el editor aclara "se publicará como mención" |
| **IN** | `20261016000001` (retiro de Notas internas; pendiente) | El contenido de las notas ya se perdió al aplicar la migración: IN solo recrea la columna vacía | Independiente | Sin efecto (v1.6 y v1.5.1 no usan la columna) |
| **PC** | `20261017000002` (avisos por cliente; aplicada en QA) | Nada de publicaciones: quita los avisos y vuelve a publicar `publications` en Realtime | Independiente | Sin vivo hasta una app que escuche `publications` |
| **AR** | `20261017000001` (archivado; aplicada en QA) | Solo la marca de archivado: **todas las archivadas vuelven a verse** (v1.6 y v1.5.1) | Antes: restaurar o revisar las archivadas | Archivar deja de ofrecerse (sin columnas) |
| **EM** | `20261018000001` (pausa de emails de colaboración; aplicada en QA, ensayada) | Nada: restaura `enqueue_comment_digest` y `request_status_email` tal como en el core, quita `collab_emails_enabled_for` y el flag `v16_collab_emails` | Independiente | Con `v16_notifications` encendido, los comentarios vuelven a encolar resúmenes que no salen sin F5 |
| **RT** | `20261015000001` (publicaciones en vivo; aplicada en QA) | Nada (solo saca `publications` de Realtime) | Independiente | Sin vivo: los cambios de otras sesiones se ven al recargar |

Si se revierten varias, el orden recomendado es **PC → AR → RT → RX → RP → CR** (de la más reciente a la más antigua); ninguna
depende de otra, pero así cada paso deja un estado que ya existió. Los comentarios, menciones y notificaciones no
se tocan en ningún caso. El bloque Z (destructivo) incluye los `drop` de las tres.

## 2d. Si un rollback se interrumpe

- **Bloque A** (sin transacción, paso a paso): todos sus pasos son idempotentes (UPDATE/`disable trigger`/`revoke`
  repetibles; A1, A4 y A5 condicionados a que el objeto exista). Si se corta en cualquier punto: **volver a ejecutar
  el bloque A completo** desde A0 y después **A6**. Ningún estado intermedio del bloque A borra datos ni afecta a
  v1.5.1; el más urgente es A3 (trigger), que se puede correr solo.
- **Bloques CR, RX, RP y Z** (cada uno en `begin … commit`): si fallan, la transacción se revierte entera y la base
  queda como antes del bloque. Revisar el error, corregir la causa y volver a ejecutar el bloque completo. No
  ejecutar sentencias sueltas de un bloque parcial fuera de su transacción (en RP, quitar la columna antes de
  recrear la función dejaría `add_publication_comment` rota).
- **Netlify**: volver a publicar el deploy de v1.5.1 es independiente de la base y se puede repetir.
- **Comprobación final** en cualquier caso: A6 (rollback completo) o, para un parcial, `node supabase/qa/v1.6/qa-db.mjs
  schema-status` en QA / la consulta equivalente en el SQL Editor.

## 3. Verificación después del rollback (QA Sandbox, usuarios QA de CLAUDE.md)

Con contraseñas temporales generadas en el momento (regla de CLAUDE.md):

- [ ] **Super Admin**: login → Clientes, Equipo, Calendarios y Publicaciones cargan. Versión en el sidebar = 1.5.1.
- [ ] **Publicaciones** (QA Sandbox): crear, editar, cambiar estado desde `•••` y desde el editor, mover con
      drag & drop en Semana, duplicar, eliminar la temporal. Sin diálogo "Enviar a revisión" (es de v1.6).
- [ ] Pasar una publicación a Aprobado → aparece el modal de v1.5.1 "¡Lista para publicar!" (no enviar el aviso
      salvo que los destinatarios sean cuentas QA que reciben correo).
- [ ] **Calendarios**: crear/archivar/desarchivar uno temporal en QA Sandbox.
- [ ] **Account Manager**: ve solo QA Sandbox; mismas operaciones de publicación.
- [ ] **Client User**: login → Planner de solo lectura de QA Sandbox; link `/p/<id>` abre la publicación; no hay
      botón Aprobar ni comentarios ni campanita.
- [ ] **Usuarios/accesos**: activar/desactivar un acceso QA y volver a activarlo; reenviar invitación no se
      prueba (envía email real).
- [ ] **Base**: `select count(*) from public.publication_status_events where created_at > '<hora del rollback>'`
      = 0 después de los cambios de estado de arriba (trigger efectivamente deshabilitado), y
      `select count(*) from public.notifications where created_at > '<hora del rollback>'` = 0.
- [ ] **Supabase Security Advisor**: sin advertencias nuevas respecto de antes de v1.6.
- [ ] Logs de Netlify sin errores de Server Actions inexistentes (salvo pestañas viejas).

## 4. Riesgos y limitaciones

- **Lo que ya ocurrió no se deshace**: emails enviados, aprobaciones hechas por clientes (el estado queda en
  Aprobado, que v1.5.1 entiende igual), comentarios. Se conservan; no se pierden datos.
- **Pestañas abiertas con v1.6** fallan al usar acciones nuevas hasta recargar.
- **Notificaciones acumuladas**: no hay. Antes del lanzamiento el flag está apagado (F1 no genera notificaciones
  con v1.5.1 activa) y el bloque A lo vuelve a apagar. Las notificaciones creadas mientras v1.6 estuvo activa
  quedan como estaban (leídas o no).
- **Desfase de historial**: mientras el trigger esté deshabilitado no se registran cambios de estado; si v1.6
  vuelve, el registro de aprobación de ese período falta (sin impacto en v1.5.1).
- **Rollback del bloque A sin Netlify** (dejar v1.6 publicada con la base desactivada): comentar, aprobar como
  cliente y marcar leídas fallan con un error de permisos (EXECUTE revocado, no "función inexistente"); el
  historial y la campanita siguen leyendo. Publicaciones, calendarios y usuarios funcionan. Es un estado
  intermedio aceptable para emergencias, no un destino.
- **`cron.job` en A6** requiere pg_cron instalado (confirmado disponible en este proyecto).
