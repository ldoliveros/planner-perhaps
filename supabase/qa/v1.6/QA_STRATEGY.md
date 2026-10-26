# Planner v1.6 — estrategia de QA aislado

Nada de esto está ejecutado. Cada paso marcado con 🔒 requiere autorización explícita.

**Recomendación:** hacer el QA completo de v1.6 (esquema, RLS, RPCs, UI, Realtime, worker, cron y rollback)
en un **proyecto Supabase Free aislado** (§B). Dejar el **dry-run transaccional en el proyecto compartido**
(§A) solo como último chequeo, inmediatamente antes de aplicar F1 en producción, para validar contra el
esquema real (que puede tener diferencias hechas desde el Dashboard).

---

## A. Dry-run transaccional en el proyecto compartido (pre-flight final)

`node supabase/qa/v1.6/build-dry-run.mjs --worker > dry_run_f1.sql` genera
`BEGIN; pre-flight + migración core + RPCs del worker + security_checks; ROLLBACK;` desde los archivos actuales.

### Qué revierte el ROLLBACK (todo lo que el script hace en la base)
Tablas, funciones, policies, grants, trigger, la fila del flag, publicaciones/eventos/notificaciones/comentarios
de prueba y los `set_config`/`set local role`: todo es transaccional en PostgreSQL. El script **no** incluye
Realtime (`000002`), cron (`000004`), extensiones, Storage, Edge Functions ni llamadas HTTP (pg_net/Resend).

### Qué NO revierte el ROLLBACK (revisado)
| Efecto | Impacto | Mitigación |
|---|---|---|
| **Locks mientras dura la transacción**: `CREATE TRIGGER` y las FKs nuevas bloquean escrituras en `publications` (y, más breve, en `clients`, `profiles`, `statuses`) hasta el ROLLBACK | La app no puede guardar publicaciones durante esos segundos | Horario sin uso; `lock_timeout = 3s` (falla rápido en vez de bloquear); `statement_timeout = 120s` |
| **Event triggers de Supabase** sobre DDL: PostgREST (`NOTIFY pgrst, 'reload schema'`) es transaccional y se descarta; **pg_graphql** incrementa una secuencia de versión de esquema (`nextval` no se revierte) | Solo invalida la caché de GraphQL (no usado por Planner) | Ninguna; inocuo |
| **Tuplas muertas** de las filas insertadas y revertidas (publicaciones de prueba, catálogo) y consumo de un XID | Despreciable; autovacuum las limpia | Ninguna |
| **Logs de Postgres / Dashboard**: errores, NOTICEs y (según configuración) el texto del SQL | Quedan en los logs del proyecto; el script no contiene secretos | No pegar contraseñas ni claves en el script |
| **Historial del SQL Editor**: el Dashboard puede guardar la consulta como snippet/historial | Visible para quien tenga acceso al proyecto | Borrar el snippet si se guardó |
| **Realtime**: solo emite cambios confirmados (decodificación lógica ignora transacciones abortadas); además ninguna tabla está publicada | Ninguno | — |
| **Error a mitad de script**: la transacción queda abortada; no confirmado cómo la cierra el SQL Editor | Podría quedar una sesión con locks hasta que se cierre | Ejecutar `rollback;` y la verificación final (`to_regclass(...)` nulos, sin trigger) |

No hay secuencias propias (todo usa `gen_random_uuid()`), ni `CREATE INDEX CONCURRENTLY`, ni `VACUUM`, ni
`ALTER SYSTEM`, ni extensiones: nada del script sale de la transacción salvo lo listado arriba.

---

## B. Proyecto Supabase aislado (QA completo) — procedimiento

### B0. Requisitos 🔒
- Autorización para **crear un proyecto Free** (el plan Free permite 2 proyectos activos por organización —
  confirmar que hay un lugar libre) y para borrarlo/pausarlo al terminar.
- Supabase CLI ya disponible (`supabase.cmd`, sin instalar nada) y Node para `next dev`.
- Contraseña de base del proyecto nuevo (se genera al crearlo; no se guarda en el repo).
- Regla para todo el procedimiento: **nunca `supabase link` ni `supabase db push` directo**. El CLI de este repo
  está enlazado a producción (`mglbzsysgsdrsbqlovwd`): un `db push` sin `--db-url` aplicaría ahí. Toda operación
  contra QA pasa por el guard `node supabase/qa/v1.6/qa-db.mjs`, que usa siempre `--db-url`, verifica que el
  destino sea `wxkbkdoaohywqabmyqjk` (planner-qa-v16) y bloquea cualquier identificador de producción.

### Proyecto QA creado
| Dato | Valor |
|---|---|
| Nombre | `planner-qa-v16` (Free) |
| Project ref | `wxkbkdoaohywqabmyqjk` |
| Project URL | `https://wxkbkdoaohywqabmyqjk.supabase.co` |
| Producción (bloqueada por el guard) | `mglbzsysgsdrsbqlovwd` · PG 17.6 · ca-central-1 |

### Credenciales — dónde se obtienen y dónde se guardan (nunca en el chat ni en el repo)
| Variable | Dónde se obtiene (Dashboard de **planner-qa-v16**) | Dónde se guarda |
|---|---|---|
| `QA_DB_URL` | Botón **Connect** → *Session pooler* (puerto **5432**, usuario `postgres.wxkbkdoaohywqabmyqjk`). Reemplazar `[YOUR-PASSWORD]` por la contraseña de base (*Project Settings → Database → Reset database password* si no se guardó al crear). Caracteres especiales del password en *percent-encoding* (`@`→`%40`, `#`→`%23`, `/`→`%2F`, `%`→`%25`) | `.env.qa.local` en la raíz del repo (gitignoreado; Next no lo lee) |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://wxkbkdoaohywqabmyqjk.supabase.co` | `.env.development.local` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *Project Settings → API Keys* → `anon` (legacy) o *publishable* | `.env.development.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | *Project Settings → API Keys* → `service_role` (legacy) o *secret* | `.env.development.local` |
| `RESEND_API_KEY` | — (no se usa en QA) | `.env.development.local` con valor **vacío**: anula la de `.env.local` |

Por qué *Session pooler*: la conexión directa (`db.<ref>.supabase.co`) es solo IPv6 en Free; el *Transaction
pooler* (6543) no sirve para migraciones. Copiar la URL tal cual la muestra el Dashboard (el host del pooler
depende de la región del proyecto QA).

Escribir los archivos desde un editor local (no por comandos que queden en el historial de la terminal) y
verificar sin conectar: `node supabase/qa/v1.6/qa-db.mjs check` y `node supabase/qa/v1.6/qa-db.mjs app-env`.
Ojo: una variable definida en la propia terminal (p. ej. `NEXT_PUBLIC_SUPABASE_URL`) tiene prioridad sobre
todos los `.env*` en `next dev` — abrir la terminal de QA sin esas variables.

### B1. Crear el proyecto 🔒
Dashboard → New project → `planner-qa-v16`, plan Free, misma región que producción.

### B2. Reproducir el esquema de v1.5.1
El esquema de producción está versionado en `supabase/migrations/` (29 migraciones, hasta `20260926000001`).
Las migraciones con guardas de datos (`simplify_statuses`, `restore_discarded_status`,
`client_accounts_handle_primary`, `campaigns`) contemplan una base vacía.
Requisito: el proyecto QA tiene que ser **PostgreSQL 17** (como producción, 17.6): `20260921000002` revoca el
privilegio `MAINTAIN`, que no existe en PG 15. Verificar en *Project Settings → Infrastructure*.

1. Checkout de v1.5.1 en otra carpeta, sin tocar la rama: `git worktree add ../planner-v151 e70582a`
   (las 29 migraciones de v1.5.1 son idénticas en `e70582a` y en la rama; la rama solo agrega `20261008000001`).
2. Desde la raíz de la rama (el guard vive acá; `--workdir` apunta al checkout de v1.5.1):
   - `node supabase/qa/v1.6/qa-db.mjs list --workdir ../planner-v151` → el remoto tiene que estar vacío.
   - `node supabase/qa/v1.6/qa-db.mjs push-dry --workdir ../planner-v151` → tiene que listar 29 migraciones,
     de `20260911000001` a `20260926000001`, y ninguna `20261008…`.
   - `node supabase/qa/v1.6/qa-db.mjs push --workdir ../planner-v151 --expect-last 20260926000001 --confirm wxkbkdoaohywqabmyqjk` 🔒
3. Esto crea tablas, funciones, RLS, grants, buckets de Storage y los lookups (plataformas, tipos, estados).

Orden y dependencias de las 29 (se aplican en orden de nombre):
| # | Migración | Depende de / requisito |
|---|---|---|
| 1 | `20260911000001_init_schema` | `pgcrypto` (preinstalada en Supabase; `if not exists`), trigger sobre `auth.users` |
| 2 | `…000002_seed_lookups` | 1 — siembra plataformas, tipos y los 6 estados originales |
| 3 | `…000003_rls` | 1 — `is_admin()`, `current_client_id()` |
| 4, 6, 7 | `…000004_storage`, `…000006_client_logos_bucket`, `…000007_client_logos_private` | esquema `storage` (viene con el proyecto) |
| 5 | `…000005_grants` | 1 |
| 8–10 | `…000008_calendars_editorial_lines`, `…000009_client_accounts`, `…000010_tiktok_platform` | 1–2 |
| 11–12 | `…000011_client_role_rls`, `…000012_service_role_profiles_grant` | 3 |
| 13–15 | `20260915000001_role_hierarchy`, `…000002_storage_role_hierarchy_fix`, `…000003_service_role_team_grants` | 3, 4 |
| 16–17 | `20260916000001_profile_self_edit_and_avatars`, `…000002_security_advisor_hardening` | 13 |
| 18 | `20260917000001_last_seen_version` | 1 |
| 19 | `20260918000001_campaigns` | 1 (backfill vacío en base nueva) |
| 20 | `20260920000001_simplify_statuses` | 2 — exige exactamente los 6 estados sembrados (base nueva ✔) |
| 21 | `20260920000002_client_accounts_handle_primary` | 9 — 0 cuentas sin handle (base nueva ✔) |
| 22–23 | `20260921000001_fix_profiles_privilege_escalation`, `…000002_harden_table_grants` | **PG 17** (`MAINTAIN`) |
| 24 | `20260921000003_restore_discarded_status` | 20 — exige `draft,in_review,approved,published` (✔ tras 20) |
| 25–28 | `20260924000001…000004` (agenda diaria + grants) | 1, 18 |
| 29 | `20260926000001_publication_client_notifications` | 1 |

Ninguna de las 29 necesita `pg_cron`, `pg_net` ni Vault (eso es recién `000004` de v1.6).

### B3. Configuración que NO está en migraciones (Dashboard del proyecto aislado)
- Authentication → URL Configuration: Site URL `http://localhost:3000`; Redirect URLs `http://localhost:3000/**`.
  (Permite probar el Magic Link del Client User, imposible hoy en local con producción.)
- Authentication → Email: dejar el SMTP por defecto (solo para QA; los usuarios se crean auto-confirmados).
- Database → Extensions: `pg_cron` y `pg_net` (solo para la fase de cron).
- Realtime: habilitado por defecto en proyectos nuevos.
- Opcional 🔒 — paridad con producción: `supabase.cmd db dump --db-url "<prod>" --schema public -f prod.sql` y lo
  mismo para el aislado; comparar. Es solo lectura sobre producción, pero usa su contraseña de base.

### B4. Roles y usuarios
- Roles de Postgres (`anon`, `authenticated`, `service_role`): vienen con todo proyecto Supabase.
- Roles de Planner (`profiles.role`) y permisos (asignaciones): los pone el seed (B5).
- Crear 4 usuarios en Authentication → Add user, con **Auto Confirm User** y contraseñas temporales:
  `qa-super-admin@`, `qa-account-manager@`, `qa-client-user@`, `qa-other-client-user@` (todos
  `@perhaps-planner-qa.com`).

### B5. Datos ficticios mínimos
SQL Editor del aislado → `supabase/qa/v1.6/isolated_seed.sql`. Aborta si la base ya tiene clientes (no puede
correr en producción por error). Crea: QA Sandbox + "QA Otro Cliente", 3 calendarios, 5 cuentas, 1 campaña, 4
publicaciones (Borrador, En revisión, Aprobada y una del otro cliente), roles y la asignación del AM.
Super Admin queda sin asignar a propósito (prueba de mencionables).

### B6. App local apuntando al aislado
- Crear `.env.development.local` (gitignoreado por `.env*`) con `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` **del aislado**, `SITE_URL=http://localhost:3000`
  y `RESEND_API_KEY=` **vacía**. En `next dev` tiene prioridad sobre `.env.local` (verificado en `@next/env`: un
  valor vacío definido acá no se pisa); `next build` no lo usa.
- `node supabase/qa/v1.6/qa-db.mjs app-env` lo valida: URL del proyecto QA, claves del proyecto QA (claim `ref`
  en las claves JWT), rol correcto de cada una y Resend anulado.
- Verificar en el navegador (pestaña Network) que las requests van al dominio del proyecto aislado.

### B7. Baseline v1.5.1 en el aislado
`next dev` desde `../planner-v151` → smoke de la sección 3 de `ROLLBACK.md` con los 3 roles. Confirma que el
aislado reproduce el comportamiento de producción antes de v1.6.

### B8. Aplicar v1.6 en el aislado
1. Desde la rama: `node supabase/qa/v1.6/qa-db.mjs push-dry` (tiene que listar solo `20261008000001`) y después
   `node supabase/qa/v1.6/qa-db.mjs push --workdir . --expect-last 20261008000001 --confirm wxkbkdoaohywqabmyqjk` 🔒
2. SQL Editor: `supabase/qa/v1.6/security_checks.sql` → `v1.6 security checks: OK`.
3. Re-correr el smoke de v1.5.1 (B7) con F1 aplicada y el flag apagado: tiene que comportarse igual, y
   `select count(*) from notifications` = 0.
4. Activar el flag solo para QA Sandbox:
   `update planner_feature_flags set client_ids = array[(select id from clients where slug='qa-sandbox')] where key='v16_notifications';`
5. Realtime y worker: pegar en el SQL Editor del aislado el contenido de `pending-migrations/v1.6/000002` y
   `000003` (no se mueven en el repo).

### B9. QA funcional de v1.6 (`next dev` desde la rama)
- Matriz por rol (SA, AM, Client User, usuario del otro cliente): envío a revisión (diálogo, cancelar, crear y
  duplicar en revisión), aprobación del cliente (también con versión vieja), concurrencia (dos editores; cliente
  aprueba mientras la agencia edita), comentarios (crear/editar/eliminar, menciones, solo lectura fuera de
  revisión), campanita (contador, toast, dos pestañas, marcar leídas, historial con "Cargar más").
- Aislamiento: el usuario del otro cliente no ve nada de QA Sandbox (ni comentarios, ni notificaciones, ni
  mencionables), y viceversa.
- Realtime: dos navegadores; cortar la red y volver; pestaña oculta y volver.
- Magic Link del Client User (posible gracias a B3).

### B10. Worker y cron (F5, cuando exista la Edge Function) 🔒
- `supabase.cmd functions deploy email-outbox --project-ref <ref del aislado>`; secrets del aislado con una
  key de Resend de prueba o destinatarios redirigidos a direcciones de prueba de Resend. Nunca la key de
  producción contra emails reales.
- Cron: `000004` en el aislado con sus propios secrets de Vault.

### B10b. Casos manuales previos al deploy (conflictos y navegación)
Dos sesiones QA (navegadores distintos) sobre una publicación TEMPORAL de QA Sandbox creada en la interfaz y
eliminada al final 🔒 (crearla requiere autorización).
- **C1** A y B en Edición; A cambia el título y guarda; B cambia el copy y guarda → diálogo "Otra persona modificó
  esta publicación"; nada de B se guarda; el formulario de B conserva lo escrito. "Copiar mis cambios" → el
  portapapeles tiene Título, Fecha, Estado, Copy, etc. con etiquetas. "Recargar versión actual" → pide confirmar
  ("Reemplazar y recargar") → se ve el título de A.
- **C2** B edita; A cambia el estado desde `•••`; B guarda → diálogo con "El estado cambió… (ahora: X)".
- **C3** B edita; A arrastra la publicación a otro día; B guarda → diálogo; la fecha de A se conserva.
- **C4** B (agencia) edita una publicación En revisión; el Client User aprueba → aviso en vivo; al guardar, diálogo.
- **C5** A y B eligen estados distintos desde `•••` → el segundo ve "Otro usuario cambió el estado".
- **C6** B edita; A elimina la publicación; B guarda → "no encontrada o sin permisos".
- **C7** Un mismo usuario guarda dos veces seguidas → sin falso conflicto. "Seguir editando" cierra el diálogo y
  Ctrl/Cmd+S vuelve a funcionar.
- **N1** KPI con Espacio = QA Sandbox y un mes distinto del actual (Mes) → Lista del Planner de QA Sandbox con ese mes.
  "Publicaciones" filtra todos los estados menos Descartada (el número coincide con el KPI); los demás KPI, su estado.
- **N2** KPI en Semana y Día → calendario de QA Sandbox en esa vista y fecha, con el filtro de estado.
- **N3** Segmento de "Distribución por estado" → mismo período filtrado por ese estado; el conteo coincide.
- **N5** Próxima publicación → abre esa publicación en su Planner, en su fecha.
- **N6** Notificación del Escritorio → abre la publicación en Comentarios y la marca leída.
- **N7** Atrás desde N1, N2, N5 y N6 → vuelve al Escritorio con los mismos filtros.
- **N8** Account Manager: el selector solo ofrece sus clientes; un `?space=` ajeno muestra "Todos los espacios".

### B11. Ensayo de rollback en el aislado
1. **Transaccional (sin persistencia)** 🔒: bloque A + A6 y, por separado, los bloques parciales CR, RX y RP, cada
   uno dentro de un DO que termina en una excepción centinela (mismo mecanismo que `dry-run-*` del guard) y una
   consulta de solo lectura posterior (`schema-status`, `flag-status`, `list`) que confirma que QA quedó igual.
2. **Real** 🔒 (autorización aparte): bloque A → app de `../planner-v151` → checklist de `ROLLBACK.md` §3 → bloque
   R → las tres baterías (`security-checks --suite core|comment-reads|replies-reactions`) y `schema-status` para
   confirmar que QA volvió al estado inicial.
Es el único lugar donde el rollback se puede ensayar completo sin riesgo. QA no tiene `pg_cron`: A1 se saltea solo
y A6 informa `cron_jobs = 0` sin error.

### B12. Cierre 🔒
Pausar o borrar el proyecto aislado; borrar `.env.development.local`; `git worktree remove ../planner-v151`.

---

## Registro de avance del QA aislado (al 2026-10-09)

Proyecto `planner-qa-v16` (`wxkbkdoaohywqabmyqjk`). Producción (`mglbzsysgsdrsbqlovwd`) y v1.5.1 intactas; sin
commits ni deploys de v1.6.

**Base y migraciones (B2–B8):** 29 migraciones de v1.5.1, 4 usuarios QA, `isolated_seed.sql` y baseline v1.5.1
hechos. Aplicadas con el guard: F1 (dry-run transaccional PASS antes de aplicarla; corrigió el bug de
autorización `can_view_client` NULL → `IS NOT TRUE`), F1b Realtime (dry-run PASS) y Trello `20261009000001`
→ 32 migraciones. Flag `v16_notifications` apagado y sin clientes. **Pendiente:** B10 (worker/cron, F3/F4 y
envío de emails postergados), B11 (ensayo de rollback) y B12 (cierre).

**Pruebas automatizadas** (SQL/tooling, sin interfaz; el repo no tiene test runner):

| Prueba | Resultado |
|---|---|
| Batería backend del Bloque 2 (permisos, RLS, RPCs, flag, outbox) en `BEGIN … ROLLBACK` | 27/27 PASS; QA idéntico al manifiesto después |
| CHECK de `trello_url` en la base vs validación de la app (`lib/trello-url.ts`) | Mismos resultados en 9 casos |
| `tsc --noEmit` + ESLint de los archivos tocados, en cada bloque | OK |

**Validaciones manuales** (sesiones reales de los usuarios QA; escrituras autorizadas paso a paso, identificadas
por `request_id`/UUID y limpiadas por ID con validaciones y ROLLBACK ante inconsistencias):

| Caso | Resultado |
|---|---|
| RT-1 Realtime autenticado (INSERT y UPDATE de comentarios) | PASS |
| RT-2 Aislamiento entre clientes a nivel de eventos | PASS |
| UI-1 Mención → notificación, campanita, historial, navegación, marcar leída | PASS. **Toast no observado:** pendiente de una prueba controlada (con la publicación abierta se omite por diseño; con la pestaña oculta se descarta) |
| RC-1 Reconexión (comentario recuperado al volver la red) | PASS |
| UI-2 Diálogo "Enviar a revisión" | PASS con desvío de procedimiento documentado (se confirmó y se revirtió a Borrador) |
| UI-2 Conflicto de edición desde la interfaz | **BLOCKED** — pendiente de prueba controlada |
| Drawer de notificaciones (visual y funcional) | PASS |
| Modal con pestañas (Edición/Publicación · Comentarios), altura estable, ocultamiento inmediato | Validado visualmente |
| Link a Trello: guardar conserva CTA/URL (verificado en la base), link inválido, crear/duplicar, vista Client User, CSV | PASS |
| Navegación (Publicaciones, Espacios → Planner individual, Administrar clientes) | Validada manualmente |
| Campanita + avatar unificados en /admin (desktop y mobile) | Validados manualmente |
| Dashboard de Inicio (`/admin`): filtros, indicadores, distribución, próximas publicaciones, notificaciones sin leer, responsive desktop y mobile | Aprobado funcional y visualmente |
| Dashboard: navegación desde un indicador o segmento con cliente, mes distinto del actual y estado seleccionados | **Pendiente** — comprobación manual |

Dashboard — verificaciones automatizadas (sin interfaz): cálculos puros de `lib/dashboard.ts` con `node`
(aritmética de meses, rango del mes con bisiestos, porcentajes que suman 100 por mayor resto, próximas
publicaciones desde hoy sin publicadas ni descartadas, URL de Publicaciones con período/espacio/estado) → OK;
`tsc --noEmit` + ESLint → OK. Revisado en código, sin prueba en navegador: marcar como leída desde el dashboard
actualiza dashboard y campanita sin recargar (mismo estado del provider, actualización optimista), y
Publicaciones carga desde el primer render el rango pedido por URL para no descartar el filtro de estado.

**Estado de los datos de QA:** sin registros de prueba de v1.6 (comentarios, menciones, notificaciones, outbox,
eventos), sin CTA/URL/Trello cargados, 0 emails enviados, flag apagado. Diferencias aceptadas (no se restauran
deshabilitando triggers): `updated_at` del flag y de `QA Borrador`, e ID del destino de `QA Borrador` (el guardado
completo recrea los destinos; misma cuenta).

**2026-10-12 — Flag para la prueba de campanita/toast (autorizado):** `v16_notifications` activado SOLO para
QA Sandbox (`enabled = false`, `client_ids = {qa-sandbox}`) con `node supabase/qa/v1.6/qa-db.mjs
flag-enable-qa-sandbox --confirm wxkbkdoaohywqabmyqjk`; verificado con `flag-status`. Antes de la prueba:
0 notificaciones de QA Sandbox (`notifications-recent`, solo lectura). Diagnóstico: con el flag apagado
`fan_out_comment` no crea notificaciones (ni campanita ni toast); además, con la publicación abierta la notificación
se marcaba leída al instante y sin toast aunque se estuviera en Edición — corregido en el frontend (solo se da por
leída si la pestaña Comentarios está a la vista).

**2026-10-12 — Dry-run de `pending-migrations/v1.6/20261013000001_v16_comment_reads.sql` (autorizado, solo QA):**
`node supabase/qa/v1.6/qa-db.mjs dry-run-comment-reads --confirm wxkbkdoaohywqabmyqjk`. Un solo statement (DO que
ejecuta la migración y `security_checks_comment_reads.sql` y termina en la excepción centinela `DRY_RUN_OK`, que
revierte todo). Resultado: **DRY_RUN_OK** (migración sin errores SQL; CR01–CR10 sin fallas). Verificación posterior
de solo lectura: tabla y funciones inexistentes, 0 publicaciones y 0 comentarios temporales. Antes: un intento
rechazado por el propio guard (falso positivo de COMMIT, corregido) y otro rechazado por el CLI al preparar
("multiple commands into a prepared statement": no se ejecutó nada). Efectos no revertibles aceptados: §A.

**2026-10-12 — `20261013000001_v16_comment_reads` APLICADA en QA (autorizado):** movida a `supabase/migrations/`;
`push-dry` listó solo esa migración; `push --expect-last 20261013000001 --confirm wxkbkdoaohywqabmyqjk` OK →
33 migraciones (local = remoto). Pruebas con `qa-db.mjs security-checks --suite comment-reads|core` (un statement,
excepción centinela = todo revertido): `security_checks_comment_reads.sql` OK y `security_checks.sql` OK (con la
T00a nueva). Flag sin cambios: `enabled = false`, solo `qa-sandbox`. Las 7 notificaciones de QA Sandbox existentes
son de la prueba manual de campanita (22:30–22:39): todas menciones, destinatarios correctos, ninguna propia, leídas.

**2026-10-12 — Dry-run de `pending-migrations/v1.6/20261014000001` (respuestas) + `20261014000002` (reacciones)
(autorizado, solo QA):** `qa-db.mjs dry-run-replies-reactions --confirm wxkbkdoaohywqabmyqjk`. Primer intento: las dos
migraciones corrieron sin errores SQL; RX01–RX02 OK y RX03 falló por un defecto de la PRUEBA (llamaba a la RPC y leía
la tabla en la misma sentencia, cuyo snapshot no ve los cambios de la función); se separó en dos sentencias. Segundo
intento: **DRY_RUN_OK** (RP01–RP08 y RX01–RX15 sin fallas). Verificación de solo lectura posterior: columna
`reply_to_comment_id` inexistente, tabla de reacciones inexistente, firma original de 4 argumentos intacta (sin la de
5), 0 publicaciones temporales; flag sin cambios. Notificaciones de QA Sandbox: 13 — las 6 nuevas respecto del registro
anterior son menciones de la prueba manual (00:09–01:15 UTC, antes del dry-run); ninguna de tipo `comment` (las que
habrían generado las pruebas RP) ni posterior al dry-run. Migraciones siguen en
`pending-migrations/` (sin push). Efectos no revertibles aceptados: §A.

**2026-10-13 — `20261014000001` (respuestas) y `20261014000002` (reacciones) APLICADAS en QA (autorizado):** movidas a
`supabase/migrations/`; `push-dry` listó solo esas dos; `push --expect-last 20261014000002` OK → 35 migraciones
(local = remoto). `security-checks --suite core | comment-reads | replies-reactions`: las tres OK (revertidas).
`schema-status` (solo lectura): columna `reply_to_comment_id` presente; tabla de reacciones con RLS, en Realtime,
`authenticated` solo SELECT, anon sin acceso, 0 filas; `add_publication_comment` con una sola firma
(`…, p_reply_to uuid`), ejecutable por `authenticated` y no por anon. Flag sin cambios (`enabled = false`, solo
`qa-sandbox`). Sin datos de prueba creados.

**2026-10-13 — Ensayo TRANSACCIONAL de rollback (B11 paso 1, autorizado, solo QA):** `qa-db.mjs rehearse-rollback
--block A | CR | RX | RP --confirm wxkbkdoaohywqabmyqjk`, cada bloque en su propia transacción terminada en la excepción
centinela (todo revertido). Resultados: **A OK** (A0–A5 sin errores y A6 verificado: flag apagado sin clientes,
trigger 'D', 0 jobs de cron —QA sin pg_cron—, 0 pendientes en la cola, 0 grants de las 11 RPCs de usuario), **CR OK**,
**RX OK**, **RP OK** (cada uno dejó su objeto revertido antes del ROLLBACK). Huella `state-snapshot` (políticas,
funciones con ACL, triggers, Realtime, columnas, grants de tablas, flag, migraciones y conteos de filas) **idéntica**
antes y después de cada bloque. Un primer intento del bloque A no llegó a ejecutarse (error de sintaxis por un bug del
guard al armar el SQL: `replace()` convertía `$$` en `$`; corregido). No se ejecutó rollback permanente ni el ensayo real.

**2026-10-13 — Dry-run de `pending-migrations/v1.6/20261015000001_v16_publications_realtime.sql` (autorizado,
solo QA):** `qa-db.mjs dry-run-publications-realtime --confirm wxkbkdoaohywqabmyqjk`. **DRY_RUN_OK**: la migración
publicó `publications` (una sola tabla nueva en `supabase_realtime`), con RLS activa y replica identity DEFAULT;
re-aplicarla en la misma transacción no falló (idempotente). `state-snapshot` idéntico antes y después (Realtime
sigue con 4 tablas, 35 migraciones). Migración sigue en `pending-migrations/` (sin push). Propuestas de seguridad
(DELETE e `internal_notes`): `pending-migrations/v1.6/PROPUESTA_seguridad_publicaciones.md`.

**2026-10-13 — `20261015000001` (publicaciones en vivo) APLICADA en QA (autorizado):** movida a `supabase/migrations/`;
`push-dry` listó solo esa; `push --expect-last 20261015000001` OK → 36 migraciones. Las tres baterías de
`security-checks` OK. `state-snapshot`: únicos cambios = `publications` en `supabase_realtime` y 36 migraciones (resto
idéntico). Flag sin cambios (`enabled = false`, solo `qa-sandbox`).

**2026-10-13 — Archivados implementado (código) y migraciones preparadas, SIN aplicar:** `20261017000001`
(archivado) y `20261017000002` (avisos de cambios por cliente, reemplaza a `publications` en Realtime) en
`pending-migrations/v1.6/`; pruebas `security_checks_archive.sql`; rollback AR y PC; dry-run listo
(`qa-db.mjs dry-run-archive`). Pendiente de autorización: dry-run → aplicación en QA → QA manual (B10c).

### B10c. QA manual mínimo de Archivados (dos sesiones; después de aplicar 20261017000001/2 en QA)
- **AR-M1** Staff archiva desde el `•••` de una tarjeta → sale del calendario y del Escritorio; toast "Publicación
  archivada" con **Deshacer** → vuelve igual (fecha, estado, comentarios, reacciones).
- **AR-M2** Archivar desde el editor ("Archivar o eliminar" → Archivar): se cierra la vista; con cambios sin guardar
  pide guardarlos o descartarlos antes.
- **AR-M3** `•••` del Planner → "Publicaciones archivadas (N)": lista, Restaurar (vuelve al Planner) y Eliminar
  definitivamente (pide confirmación; desaparece del panel).
- **AR-M4** "Ver todos": el panel lista archivadas de todos los clientes del usuario, con el cliente en cada fila.
- **AR-M5** Exclusión: Escritorio (KPI, distribución, redes, próximas), CSV, conteos en Clientes/Calendarios no
  incluyen archivadas.
- **AR-M6** Client User: la archivada desaparece de su Planner abierto SIN recargar; `/p/<id>` → "No pudimos abrir";
  restaurada, vuelve a aparecer en vivo.
- **AR-M7** Dos sesiones staff: A archiva / restaura / elimina → B lo ve en vivo; si B la tenía abierta: se cierra con
  "…archivada por otro usuario" / "…eliminada por otro usuario".
- **AR-M8** Archivada = solo lectura: un editor abierto en otra sesión no puede guardarla (error), y no se puede
  comentar ni reaccionar.
- **AR-M9** Account Manager: solo ve/archiva/restaura publicaciones de sus clientes.
- **AR-M10** `daily-agenda`: una archivada con fecha de hoy y estado pendiente no aparece en la agenda (probar con la
  función desplegada en QA, sin envío real: `RESEND_API_KEY` vacía).

**2026-10-13 — `20261017000001` (archivado) y `20261017000002` (avisos por cliente) APLICADAS en QA (autorizado):**
`dry-run-archive` → DRY_RUN_OK (AR01–AR09, PC01–PC08) y `state-snapshot` idéntico; movidas a `supabase/migrations/`;
`push-dry` listó solo esas dos (`20261016000001` sigue en pending-migrations y no se incluye); `push` OK → 38
migraciones. Baterías core, comment-reads, replies-reactions y archive: OK. Ensayos transaccionales PC y AR: OK con
`state-snapshot` idéntico. Realtime: `publication_changes` publicada, `publications` ya no. Flag sin cambios.

**2026-10-13 — Cierre técnico (solo lectura / transacciones revertidas, QA):** `list` → 38 migraciones, local = remoto.
Baterías `security-checks` core, comment-reads, replies-reactions y archive: **OK** (revertidas); `state-snapshot`
idéntico antes y después. Flag: `enabled = false`, solo `qa-sandbox`. Realtime: `notifications`,
`publication_changes`, `publication_comment_reactions`, `publication_comments`, `publication_status_events`.
`internal-notes-status`: columna presente, 0 filas con notas, sin dependencias. `daily-agenda`: `agenda.ts` corrido
desde Node en `dryRun` (Resend bloqueado, escrituras bloqueadas): con datos en memoria excluye la archivada (2 de 3) y,
sin la columna, cae a la consulta de v1.5.1; contra QA real la consulta con `archived_at` corre sin error (0
publicaciones con fecha de hoy: la exclusión con datos reales queda para AR-M10). QA tiene 0 archivadas.
`tsc` OK, `next build` OK, `eslint .`: solo los 9 problemas preexistentes de `supabase/functions/daily-agenda`
(idénticos en `main`). Runbook: `supabase/rollback/v1.6/DEPLOY_RUNBOOK.md`.

**2026-10-13 — Regresión automatizada final previa a B11 (QA, sin cambios persistentes):** `tsc` OK; `next build` OK;
`eslint .`: solo los 9 problemas preexistentes de `supabase/functions/daily-agenda` (idénticos en `main`). `list`: 38
migraciones, local = remoto. `flag-status`: `enabled = false`, solo `qa-sandbox`. `security-checks` core,
comment-reads, replies-reactions y archive: OK (revertidas). `rehearse-rollback --block A` con las 38 migraciones:
**OK** (A0–A5 + A6, revertido). `state-snapshot` idéntico antes y después de todo (Realtime: `notifications`,
`publication_changes`, `publication_comment_reactions`, `publication_comments`, `publication_status_events`; trigger de
estados activo). Estática: ningún cambio de estado (editor, `•••`, Tablero) llama a `request_status_email` ni a
`notifyClientPublicationApproved` (la sección "Aviso al cliente" ya no se importa). D2: `20261016000001` queda fuera
de v1.6. Regresión manual R1–R9: pendiente salvo R9 (búsqueda: 8/8 originales y modal aprobado visualmente).

**2026-10-13 — Preparación de B11 (sin ejecutar el rollback):** destino verificado: QA `wxkbkdoaohywqabmyqjk` (guard y
`.env.development.local`; producción `mglbzsysgsdrsbqlovwd` bloqueada por el guard y no usada). `email_outbox`: 2 filas
`pending`, ambas `comment_digest` de QA Sandbox sobre "QA En revisión", para `qa-account-manager@…` y
`qa-client-user@…` (datos de prueba). Publicación temporal archivada: **no creada** — la service key de QA no tiene
permisos de escritura sobre `publications` ni lectura sobre `calendars` (no se tocaron grants); crearla desde la app
como QA Super Admin ("QA B11 — temporal archivada", QA Sandbox) y archivarla con «Archivar». Snapshot de referencia
pre-B11: 38 migraciones, 5 publicaciones (incluye "test", creada desde la app 15:05 UTC), 0 archivadas, 20 eventos de
estado, flag `false:1`, 2 en cola; repetirlo justo antes de B11 si hubo QA manual en el medio.

**2026-10-14 — Regresión manual R1–R9: APROBADA (9/9), ejecutada y confirmada por el usuario** (no ejecutada por Claude).

**2026-10-14 — Verificación final previa a B11 (solo lectura):** destino QA `wxkbkdoaohywqabmyqjk` en el guard, en la app
v1.6 y en `../planner-v151` (producción `mglbzsysgsdrsbqlovwd` bloqueada y no usada). Publicación temporal
"QA B11 — temporal archivada" presente en QA Sandbox, archivada (`archived_at` 2026-10-14 11:40 UTC, creada y archivada
desde la app). `email_outbox`: las mismas 2 filas `comment_digest` `pending` del 2026-10-12 (la regresión R2 no encoló
nada). Flag `enabled = false`, solo `qa-sandbox`. Snapshot pre-B11: 38 migraciones, 6 publicaciones, 22 eventos de
estado, 22 notificaciones, 18 comentarios, 3 reacciones, 2 en cola (0 canceladas), trigger de estados activo, Realtime =
`notifications, publication_changes, publication_comment_reactions, publication_comments, publication_status_events`.
Huellas de columnas, funciones, políticas, triggers y grants idénticas a las del ensayo transaccional del bloque A
(2026-10-13): los scripts corresponden al esquema actual. Bloque R: sus grants coinciden con los revokes de A4; su paso
de Realtime quedó como SQL concreto (vuelve a publicar las 5 tablas actuales, no `publications`).

**2026-10-14 — B11 REAL en QA (autorizado; producción excluida), etapas 1–5:**
1. Destino QA verificado; snapshot inicial 11:50 UTC (= snapshot pre-B11).
2. Bloque A (SQL Editor, usuario) a las 11:56:08 UTC: A6 = `false`, `{}`, `D`, `0`, `0`, `0`. Guard: flag sin clientes,
   trigger `D`, Realtime vacío, RPCs de v1.6 sin EXECUTE (lectura intacta), 2 filas de la cola en `cancelled`; políticas,
   columnas y grants de tablas sin cambios.
3. Smoke v1.5.1 (`../planner-v151` `e70582a`, puerto 3002, usuario): S1–S7 OK (incluye: la archivada se ve para el staff
   y no se puede editar; el Client User no la ve); S8: 0 eventos de estado y 0 notificaciones posteriores al bloque A.
4. Bloque R + flag solo QA Sandbox (SQL Editor, usuario): `false`, `{qa-sandbox}`, trigger `O`, 11 grants, Realtime con
   las 5 tablas (sin `publications`), 0 pendientes.
5. `security-checks` core, comment-reads, replies-reactions y archive: OK. `schema-status` igual al inicial. Snapshot
   final vs inicial: solo `outbox_cancelled` 0 → 2 (las 2 filas de prueba, esperado) y `publications` 6 → 7 ("test",
   borrador, QA Sandbox, creada en el smoke a las 12:07:47 UTC, sin evento de estado por el trigger deshabilitado —
   desfase de historial documentado). Huellas de funciones (ACL), políticas, triggers, columnas, grants y Realtime
   idénticas a las iniciales.
6. Smoke final de v1.6 (usuario): 5/5 OK (app 1.6.0, cambio de estado, comentarios y reacciones, notificaciones,
   Realtime entre dos sesiones). Limpieza desde la app v1.6 (usuario, sin SQL): "QA B11 — temporal archivada"
   (`ef268f76-…`) restaurada y eliminada; "test" del smoke (`648f573f-…`) eliminada; "test" del 13/10 (`cc03aaf0-…`,
   En revisión) conservada. Verificado: ninguna de las dos existe, 0 archivadas. Servidor v1.5.1 (3002) detenido.
7. Validación final: `security-checks` de las cuatro suites OK; flag `enabled = false`, solo `qa-sandbox`; trigger `O`;
   Realtime con las 5 tablas (sin `publications`); RPCs de v1.6 ejecutables por `authenticated` y no por anon. Snapshot
   final vs inicial: `outbox_cancelled` 0 → 2 (las 2 filas `comment_digest` de prueba, `skip_reason = 'rollback v1.6'`;
   no vuelven a la cola), `publications` 6 → 5 (−temporal B11; el "test" del smoke se creó y se eliminó), `comments`
   18 → 19 y `status_events` 22 → 23 (smoke final de v1.6). Huellas de columnas, funciones (ACL), políticas, triggers y
   grants idénticas. Diferencia de datos documentada: la publicación creada durante el rollback no tuvo evento de estado
   (trigger deshabilitado; ya eliminada).

**B11 CERRADO (2026-10-14):** rollback real aprobado; smoke v1.5.1 8/8 (S1–S8) aprobado; reactivación aprobada;
seguridad posterior aprobada; smoke final v1.6 5/5 aprobado; limpieza completa. Diferencias esperadas: emails de la
cola cancelados y ausencia de historial de estados durante el rollback.

**2026-10-14 — Pausa de emails de colaboración `20261018000001` APLICADA en QA (autorizado):** dry-runs de las dos
variantes (triggers sobre el outbox / pausa dentro de las funciones): ambas OK; aprobada la variante en funciones
(`enqueue_comment_digest` y `request_status_email` con su cuerpo del core + salida temprana; flag `v16_collab_emails`
creado apagado; `collab_emails_enabled_for`). Movida a `supabase/migrations/`; `push-dry` listó solo `20261018000001`;
`push --expect-last 20261018000001` OK → **39 migraciones**, local = remoto. Baterías `security-checks` core,
comment-reads, replies-reactions, archive y collab-emails (EM01–EM10): OK. `rehearse-rollback --block EM`: OK (revertido).
Prueba de integración automatizada `integration_collab_emails_paused.sql` (suite `collab-integration`, IT01–IT12,
revertida) con los usuarios QA reales bajo RLS: el Account Manager envía a revisión (UPDATE condicional) y comenta, el
Client User responde (con referencia), el Account Manager menciona al Client User; se guardan los 3 comentarios; se
crean las notificaciones de revisión, respuesta y mención; campanita del Client User +2 y comentarios no leídos = 2, y
ambos vuelven a su valor al marcarlos leídos; `request_status_email` devuelve 0 sin marcar `email_requested` y rechaza al
Client User; la aprobación del cliente cambia el estado y notifica al Account Manager (+2); permisos intactos;
`email_outbox` / `email_outbox_items` sin registros nuevos en todo el flujo. Reemplaza la verificación manual en la UI.
Cobertura NO automatizada: render de la interfaz, entrega de Realtime al navegador y los Server Actions de Next.js (la
lógica que ejecutan sí: las mismas RPCs y consultas bajo RLS). Estado final: flag `v16_collab_emails` apagado sin
clientes; `v16_notifications` sin cambios (apagado, solo `qa-sandbox`); trigger de estados `O`; Realtime con las 5
tablas; políticas, triggers y grants de tablas iguales; las 2 filas de la cola siguen `cancelled`; snapshot idéntico
antes y después de las baterías, el ensayo EM y la integración (sin datos de prueba: 0 publicaciones, comentarios ni
notificaciones de prueba). `daily-agenda` sin cambios. Emails de colaboración postergados hasta F5 (= encender el flag).

**B11 real — pasos manuales (SQL Editor del proyecto QA; verificar en la URL del Dashboard que el ref es
`wxkbkdoaohywqabmyqjk`):**
1. **Bloque A**: pegar `rollback_v16.sql` desde `-- A0)` hasta el `select` de A6 inclusive (fin de la consulta
   `... as v16_rpc_grants;`). A6 debe dar `flag_enabled = false`, `flag_client_ids = {}`, `trigger_state = D`,
   `cron_jobs = 0`, `outbox_pending = 0`, `v16_rpc_grants = 0`. Anotar la hora.
2. **Smoke v1.5.1**: detener la app v1.6 (puerto 3001) o usar otro puerto; levantar `../planner-v151` (commit `e70582a`,
   QA, sin Resend) y recorrer `ROLLBACK.md` §3, más: "QA B11 — temporal archivada" se ve para el staff y no se puede
   editar; el Client User no la ve. Consultas de §3 (`publication_status_events` / `notifications` posteriores a la hora
   de A) = 0.
3. **Bloque R**: descomentar y ejecutar, del bloque R, el `enable trigger`, el `do $$` de grants condicionales, los 7
   `grant execute` y el `do $$` de Realtime. NO el cron (QA no tiene `pg_cron`) ni `enabled = true`. Después, devolver el
   flag a QA Sandbox: `update public.planner_feature_flags set client_ids = array[(select id from public.clients where
   slug = 'qa-sandbox')] where key = 'v16_notifications';`.
4. **Guard**: `security-checks` de las cuatro suites, `schema-status`, `flag-status` y `state-snapshot`. Diferencias
   esperadas respecto del snapshot pre-B11: `outbox_cancelled = 2` (las 2 filas de prueba, no vuelven a `pending`) y lo
   creado o cambiado en el smoke de v1.5.1. Huellas de políticas, funciones, triggers, grants, Realtime y trigger `O`:
   iguales.
5. App v1.6: restaurar "QA B11 — temporal archivada" y eliminarla.

**B11 real — preparado, NO ejecutado (requiere autorización):**
1. `state-snapshot` y `flag-status` de referencia; `rehearse-rollback --block A` transaccional otra vez (el anterior
   fue con 35 migraciones; ahora son 38).
2. Opcional, para ensayar el riesgo de archivadas: archivar UNA publicación de QA Sandbox desde la app (dato de QA).
3. Bloque A real (SQL Editor del proyecto QA o guard) + A6.
4. App `../planner-v151` (commit `e70582a`, `.env.development.local` → QA, sin `RESEND_API_KEY`) → checklist de
   `ROLLBACK.md` §3, más: la archivada se ve para staff, no se puede editar, el Client User no la ve.
5. Bloque R → `security-checks` de las cuatro suites + `schema-status` + `state-snapshot` (debe coincidir con el paso 1
   salvo el `note` del flag y lo que haya hecho el smoke de v1.5.1).
6. Restaurar la archivada del paso 2 desde la app v1.6.
Ejecución real de A y R: SQL Editor del proyecto QA (el guard solo ensaya en transacciones revertidas). Después de R,
volver a dejar el flag solo para QA Sandbox (`client_ids = array[qa-sandbox]`, como antes: A0 lo vacía).
**Detener B11 si:** el destino no es `wxkbkdoaohywqabmyqjk`; un paso de A falla (re-ejecutar A completo desde A0, es
idempotente) o A6 no da lo esperado; v1.5.1 no puede guardar/cambiar estado en QA (correr R y analizar); cualquier
batería falla después de R; el snapshot final difiere en algo distinto de lo esperado (nota del flag, 2 filas de la
cola en `cancelled`, la publicación temporal y lo hecho en el smoke de v1.5.1).
Afecta solo a QA: mientras dure, las RPCs de v1.6 quedan sin EXECUTE (la app v1.6 local no puede comentar, aprobar ni
marcar leídas), no se registran eventos de estado (trigger deshabilitado), las filas pendientes de la cola de email
(hoy hay 2 en total en `email_outbox`) pasan a `cancelled` y no vuelven con el bloque R, y si se corre A5, el bloque R
tiene que volver a publicar `publication_changes` (agregado al bloque R el 2026-10-13).

### B10e. Regresión manual mínima antes del deploy (pendiente de ejecución)

Una pasada por rol, en QA Sandbox, con datos existentes; marcar solo lo ejecutado.
- **R1 Publicaciones**: crear, editar (con Trello), duplicar, mover de fecha en Semana, eliminar una temporal propia.
- **R2 Estados**: Borrador → En revisión ("Enviar a revisión", sin opción de email) → Aprobado (directo, sin diálogo
  ni email) por `•••`, Tablero y editor, con el flag encendido y apagado; cancelar "Enviar a revisión" devuelve la
  tarjeta; `email_outbox` sin filas nuevas.
- **R3 Aprobación del cliente y conflicto**: Client User aprueba una En revisión; staff con el editor abierto en otra
  sesión guarda → aviso de conflicto, sin pisar.
- **R4 Comentarios**: comentar con mención, responder, reaccionar, editar y eliminar (solo En revisión); contador de no
  leídos.
- **R5 Notificaciones**: campanita, drawer, historial, marcar leídas; toast de notificación nueva.
- **R6 Archivados**: archivar + Deshacer, restaurar desde "Publicaciones archivadas", Client User no la ve; Tablero y
  contadores la excluyen.
- **R7 Roles**: Account Manager solo ve QA Sandbox; Client User sin acciones de staff ni arrastre en Tablero, Trello
  visible.
- **R9 Búsqueda global** — modal desde la lupa del encabezado (sin cambiar de ruta) y páginas `/admin/search?q=&space=`
  y `/client/search?q=` por URL directa. Modal: foco en el campo; cierra con Escape, X y clic afuera sin perder la
  pantalla; fondo sin scroll; hereda el espacio que se estaba viendo ("Todos los espacios" desde Publicaciones); Enter
  y la lupa del campo buscan (nunca al escribir); cambiar de espacio conserva el término y vuelve a la página 1;
  encuentra publicaciones de cualquier fecha y de otros espacios/calendarios accesibles; sin acentos ni mayúsculas
  ("revision" → "QA En revisión"); archivadas excluidas, descartadas incluidas; paginación (25) en el pie; elegir un
  resultado cierra el modal y abre la publicación (también en el mismo Planner), sin overlays colgados; mobile a
  pantalla completa con el selector debajo. Permisos: el Account Manager no ve "Otro cliente — no debe verse desde QA
  Sandbox"; el Client User solo QA Sandbox (sin selector); `space` ajeno en la URL de la página se ignora.
- **R8 UI final**: selector compacto (tooltips, color del cliente, cambia al cambiar de espacio); 3+ toasts apilados y
  Deshacer.

### B10d. QA manual de la vista Tablero (Kanban) — sin migraciones

Frontend puro (`components/calendar/board-view.tsx`, flujo compartido `use-status-change-flow.tsx`). Usar
publicaciones existentes del QA Sandbox; no crear publicaciones ni usuarios. tsc, ESLint y `next build`: OK
(2026-10-13). Casos (pendientes de ejecución manual):

- **T1** Selector Calendario / Tablero / Lista: Tablero queda activo, `?view=board` persiste al recargar, y volver a
  Calendario recupera la última vista Día/Semana/Mes.
- **T2** Cinco columnas fijas en orden (Borrador, En revisión, Aprobado, Publicado, Descartado) con contador; una
  columna vacía muestra "Sin publicaciones"; Descartado siempre visible.
- **T3** Período: el tablero muestra solo el mes elegido; ‹ › y el selector de mes cambian el contenido; los
  contadores coinciden con Lista en el mismo mes y con los mismos filtros.
- **T4** Filtros, búsqueda, calendarios y espacio (Publicaciones → Ver todos / un espacio) se aplican igual que en
  Lista; en vistas combinadas la tarjeta muestra el cliente (y el calendario si hay varios).
- **T5** Clic en una tarjeta abre la Vista de Publicación de siempre (pestañas, comentarios, Trello).
- **T6** Drag Borrador → Aprobado: se guarda directo (sin diálogo "¡Lista para publicar!" ni email desde el
  2026-10-13).
- **T7** Drag a En revisión: aparece "Enviar a revisión"; Cancelar devuelve la tarjeta; Confirmar guarda.
- **T8** Soltar en la misma columna o fuera del tablero: no guarda nada (sin toast). Un cambio a la vez: un segundo
  drag mientras el primero guarda se rechaza con aviso.
- **T9** Conflicto: con dos sesiones, cambiar el estado en B y luego arrastrar en A (sin refrescar si el aviso en vivo
  no llegó): el UPDATE condicional rechaza, toast de error y la tarjeta vuelve; nunca se pisa el cambio de B.
- **T10** En vivo: un cambio de estado, archivo o restauración en otra sesión mueve, quita o agrega la tarjeta y
  actualiza los contadores sin recargar; las archivadas nunca aparecen ni cuentan (Descartado ≠ archivado).
- **T11** Client User: sin arrastre (sin cursor de agarre ni resaltado de columnas), sin "Cambiar estado"; el clic
  abre la publicación con sus comentarios/aprobación y Trello visible.
- **T12** Responsive: en mobile y ventana angosta, las 5 columnas con scroll horizontal (sin arrastre táctil, el
  scroll no mueve tarjetas); el cambio de estado alternativo para staff es "Cambiar estado" en el `•••` (también por
  teclado: Tab hasta la tarjeta → `•••` → Enter).

---

## C. Después del QA aislado
1. §A (dry-run en el compartido) inmediatamente antes de F1.
2. F1 real con el flag apagado (v1.5.1 sigue en producción; no se acumulan notificaciones). Incluye la migración
   de Trello `20261009000001`, que tiene que estar aplicada antes del deploy de v1.6.
3. Realtime, worker y cron, y recién después el deploy de v1.6 + flag `enabled = true`.
