# Runbook de despliegue de Planner v1.6.0 (producción)

Preparado el 2026-10-13, actualizado el 2026-10-14 (auditoría de release). **No ejecutado.** Cada paso marcado 🔒 requiere
autorización explícita en el momento. Producción: Supabase `mglbzsysgsdrsbqlovwd` · Netlify (build desde `main`) ·
https://planner.perhaps.com.ar. Rollback: `ROLLBACK.md` (mismo directorio). Migraciones:
`supabase/pending-migrations/v1.6/README.md`. Pre-flight de solo lectura: `prod_preflight_readonly.sql`.

## 0. Decisiones previas — todas resueltas

| # | Decisión |
|---|---|
| D1 | **Emails de colaboración sin worker (F5)** — resuelto: la app no ofrece ni envía los emails de "Enviar a revisión" y "¡Lista para publicar!" (2026-10-13), y `20261018000001_v16_pause_collab_emails` (aplicada en QA 2026-10-14) impide que comentarios, menciones, respuestas y `request_status_email` encolen emails mientras el flag `v16_collab_emails` esté apagado. Sin pendientes acumulados. Retomar en F5: encender el flag junto con el worker y el cron. |
| D2 | **Notas internas** — resuelto: `20261016000001` queda **fuera** de v1.6 (sigue en `pending-migrations/`). La columna `internal_notes` se conserva; v1.6 no la lee ni la escribe. |
| D3 | **Metadata** — resuelto: `APP_VERSION = "1.6.0"` y entrada 1.6.0 en `lib/changelog.ts` (fecha 2026-10-13: ajustar al día real del deploy). |
| D4 | **Archivo accidental** `isValidTrelloUrl(v)` — resuelto: eliminado. |

## 1. Contenido del release (auditoría 2026-10-14)

- Rama `feature/v1.6-collaboration` en `e70582a` (= `main` = `origin/main`), sin commits propios: todo v1.6 está en el
  working tree (57 archivos modificados respecto de `main` y 77 sin seguimiento, todos en `app/`, `components/`, `lib/`,
  `supabase/`). Worktree `../planner-v151` (detached en `e70582a`): referencia de rollback, fuera del release.
- Sin secretos en los cambios (solo menciones de `RESEND_API_KEY=` vacía en docs y en el guard de QA); los `.env*`
  están ignorados. Sin `console.log`/`debugger` ni restos de pruebas. Sin dependencias nuevas ni cambios en
  `package.json`, `netlify.toml` o `next.config.ts`. Variables: las mismas 5 de v1.5.1.
- **Excluir del commit:** `.claude/launch.json` (configuraciones locales `dev-v16`/`v151-b11` agregadas para QA;
  restaurar la versión de `main`). Decidir si se versionan `CLAUDE.md` (sección v1.6) y la carpeta `supabase/qa/`
  (herramientas y registro de QA; sin secretos, con los refs de proyecto).
- **Migraciones de producción (10, en este orden):** `20261008000001_v16_collab_core`,
  `20261008000002_v16_realtime_publication`, `20261009000001_publications_trello_url`,
  `20261013000001_v16_comment_reads`, `20261014000001_v16_comment_replies`, `20261014000002_v16_comment_reactions`,
  `20261015000001_v16_publications_realtime`, `20261017000001_v16_publication_archive`,
  `20261017000002_v16_publication_changes`, `20261018000001_v16_pause_collab_emails`. Excluidas (en `pending-migrations/v1.6/`): `20261008000003` (worker),
  `20261008000004` (cron), `20261016000001` (Notas internas). Ninguna de las 10 depende de las excluidas; las guardas
  exigen el orden anterior y que `supabase_realtime` exista sin `FOR ALL TABLES`.

## 2. Verificaciones previas

- [x] QA: R1–R9 aprobada y B11 cerrado (2026-10-14, QA_STRATEGY.md). Lecciones: A2 cancela la cola y R no la
      restaura; durante A no hay historial de estados; el Realtime de R es el `do $$` concreto (5 tablas, sin
      `publications`); tras R el flag vuelve a su estado previo; en v1.5.1 las archivadas se ven para el staff pero
      no se editan, y el Client User no las ve.
- [ ] Commit final: `tsc --noEmit`, `eslint .` (solo los 9 problemas preexistentes de `supabase/functions/daily-agenda`),
      `next build`.
- [ ] 🔒 Producción, solo lectura: `prod_preflight_readonly.sql` en el SQL Editor → valores esperados en el archivo.
- [ ] 🔒 Producción, solo lectura: `supabase.cmd migration list` (CLI enlazado a producción; pide la contraseña de la
      base) → última `20260926000001`, ninguna de v1.6.
- [ ] 🔒 Producción, solo lectura: `supabase.cmd functions list --project-ref mglbzsysgsdrsbqlovwd` y
      `supabase.cmd secrets list --project-ref mglbzsysgsdrsbqlovwd` (solo nombres): `daily-agenda` desplegada y
      secrets `RESEND_API_KEY`, `SITE_URL` presentes.
- [x] Netlify: deploy de producción vigente (v1.5.1) = Deploy ID `6abb97a46de2fd000848f952`, commit `e70582a`, sitio
      `planner.perhaps.com.ar`, **auto publishing activado** (registrado en `ROLLBACK.md` §0, 2026-10-24). Con auto
      publishing activo, el merge a `main` (paso 3) publica v1.6.0 sin un paso manual: el merge ES el deploy.
- [ ] Netlify: confirmar que las 5 variables existen en el contexto *Production* (sin copiar valores).
- [ ] Ventana de bajo uso y aviso a usuarios (las pestañas abiertas necesitan recargar).

## 3. Plan de despliegue

| Paso | Qué cambia | Cómo se verifica | Detenerse si |
|---|---|---|---|
| **1. Backup** 🔒 | Nada en producción (solo lectura). Plan Free: **sin backups automáticos** → backup manual con `C:\Users\ldoli\Documents\planner-backups\backup_prod_v151.ps1` (ver §6). | `integrity.txt`: TOC OK de los dos dumps y ninguna diferencia de filas vivo vs dump; `SHA256SUMS.txt` generado; tamaños no nulos. Restauración de prueba en un cluster local descartable (§6.4). | El script falla, una tabla aparece con diferencias o el TOC es ilegible. |
| **2. Pre-flight y migraciones** 🔒 | Paso 2a sin cambios: `prod_preflight_readonly.sql` y `db push --dry-run`. Paso 2b: `supabase.cmd db push` aplica las 10 (tablas, funciones, RLS, trigger de historial, Realtime, columnas `trello_url`/`archived_at`, pausa de emails de colaboración con `v16_collab_emails` apagado). | 2a: valores esperados y el dry-run lista exactamente las 10. 2b: `migration list` con 39; v1.5.1 (todavía publicada) crea, edita, cambia estado y mueve en QA Sandbox; flags `v16_notifications` y `v16_collab_emails` con `enabled = false` y `client_ids = {}`; Security Advisor sin warnings nuevos. | El dry-run lista otra cosa; cualquier guarda aborta; v1.5.1 no puede guardar (→ **A3** de inmediato y revisar). |
| **3. Código y Netlify** 🔒 | Commit de v1.6 en la rama (sin `.claude/launch.json`), PR a `main`, merge → Netlify compila y publica v1.6.0. | Build de Netlify verde; sidebar "v1.6.0"; `/admin` y `/client` cargan; logs sin errores de Server Actions. | Build rojo (v1.5.1 sigue publicada: no hacer nada más); errores 500 o de login (→ Netlify a v1.5.1). |
| **4. `daily-agenda`** 🔒 | `supabase.cmd functions deploy daily-agenda --project-ref mglbzsysgsdrsbqlovwd` (verify_jwt=false por `supabase/config.toml`). Solo agrega el filtro de archivadas (compatible con o sin la columna). | `functions list` con versión nueva; **no invocarla a mano**; al día siguiente, `daily_agenda_log` con envíos normales y sin archivadas. | El deploy falla (la versión anterior sigue activa: reintentar o dejarla). |
| **5. Smoke en producción** | Datos de prueba solo en QA Sandbox de producción, con los usuarios QA. | Checklist §4 con el flag apagado. | Cualquier ítem falla → evaluar §5. |
| **6. Activación controlada** 🔒 | 6a: `update public.planner_feature_flags set client_ids = array[(select id from public.clients where slug = 'qa-sandbox')] where key = 'v16_notifications';` (solo QA Sandbox). 6b, tras validar: `update public.planner_feature_flags set enabled = true where key = 'v16_notifications';` (todos los clientes). | 6a: comentario con mención, enviar a revisión y aprobación del cliente en QA Sandbox generan notificaciones y campanita en vivo; otros clientes, ninguna. 6b: primeras notificaciones reales sin errores; `email_outbox` sin filas nuevas (emails pausados, D1). | Notificaciones duplicadas, a destinatarios equivocados o de otros clientes → **A0** (flag apagado) y revisar. |
| **7. Rollback** | Ver §5 y `ROLLBACK.md`. | — | — |

## 4. Smoke en producción (después del paso 3 y de nuevo después de 6a)

- [ ] Sidebar "v1.6.0"; banner de Novedades 1.6.0; `/admin` (Inicio) para Super Admin y Account Manager.
- [ ] Planner de QA Sandbox: Calendario/Lista/Tablero, abrir publicación, editar y guardar (con Trello).
- [ ] Cambio de estado por `•••`, Tablero y editor: "Enviar a revisión" pide confirmación (sin email); Aprobado directo.
- [ ] Archivar y Deshacer en una publicación de prueba de QA Sandbox; "Publicaciones archivadas (N)".
- [ ] Búsqueda global (lupa → modal) encuentra publicaciones de otra fecha; el Account Manager no ve otros clientes.
- [ ] Client User: portal, Trello visible, sin acciones de staff, aprobación de una En revisión.
- [ ] Netlify y Supabase logs sin errores (RLS, trigger, Server Actions).

## 5. Criterios de rollback y recuperación

- Falla de guardado o cambio de estado tras el paso 2 → **A3** (trigger) de inmediato; si persiste, bloque A completo.
- Error generalizado de v1.6 (500, Server Actions, login) → Netlify a v1.5.1 (Publish deploy del ID anotado + Stop
  auto publishing) y bloque A.
- Notificaciones o emails de más → **A0** (+A1/A2); v1.6 puede quedar publicada.
- Fuga de datos entre clientes o permisos incorrectos → Netlify a v1.5.1 + bloque A completo, y revisar.
- Procedimiento: `ROLLBACK.md` en orden: **§1 paso 0 (archivadas: contar, exportar, decidir)** → Netlify → bloque A +
  A6 → verificación §3. `daily-agenda` de v1.6 se deja desplegada. Re-activación: bloque R (probado en B11). Pérdida de
  datos: ninguna; quedan la cola cancelada y el hueco de historial mientras dure A. Recuperación total ante corrupción
  de datos: backup del paso 1 (PITR o restore del dump) — solo con decisión explícita.

## 6. Backup manual y recuperación (plan Free, sin backups automáticos)

### 6.1 Generación (solo lectura, la ejecuta el usuario)
```
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\ldoli\Documents\planner-backups\backup_prod_v151.ps1"
```
Pide la contraseña de la base de producción en la consola (oculta; vive solo en el proceso y se borra al terminar).
Conecta por el session pooler (`aws-0-ca-central-1.pooler.supabase.com:5432`, usuario `postgres.mglbzsysgsdrsbqlovwd`)
con `pg_dump`/`psql` 17.11 (servidor 17.6): `pg_dump` en su transacción READ ONLY y cada consulta de `psql` dentro de `begin transaction read only … rollback`. Aborta si la última migración no es `20260926000001` (producción v1.5.1). Termina en `BACKUP COMPLETO Y VERIFICADO` (código 0) o `BACKUP INCOMPLETO` (código 1). Salida en
`C:\Users\ldoli\Documents\planner-backups\prod-v151-<fecha>\` (perfil del usuario; fuera del repo):

| Archivo | Contenido |
|---|---|
| `prod_public_full.dump` | `public` + `supabase_migrations`: tablas, datos, políticas RLS, funciones, triggers, índices, grants, historial de migraciones (formato custom, restaurable selectivamente) |
| `prod_public_schema.sql` | El mismo esquema en SQL legible (para comparar) |
| `prod_auth_storage_data.dump` | Datos de `auth` (usuarios e identidades: incluye hashes bcrypt de contraseñas y tokens pendientes de confirmación/recuperación de `auth.users`) y `storage` (buckets y metadatos). **Excluidos a propósito:** tokens de refresco, sesiones, códigos de un solo uso, MFA, estados de flujo y auditoría |
| `counts_live.txt`, `extensions.txt`, `storage_buckets.txt` | Filas por tabla en vivo, extensiones y buckets |
| `integrity.txt`, `*.toc.txt`, `SHA256SUMS.txt`, `backup.log` | Verificación (§6.3) |

### 6.2 Qué NO cubre el dump (respaldar o anotar aparte)
- **Archivos de Storage** (imágenes de publicaciones, logos): el dump guarda solo sus metadatos (`storage.objects`); los
  binarios viven en el almacenamiento de objetos. v1.6 no borra ni mueve archivos, así que el riesgo del deploy es bajo;
  si se quiere copia, descargar los buckets de `storage_buckets.txt` (Dashboard o un script con la service key, 🔒).
- **Esquema interno de Auth/Storage, roles y extensiones de Supabase**: los provee la plataforma en cualquier proyecto;
  `extensions.txt` lista las instaladas. No hay roles propios de Planner.
- **Secretos y configuración del proyecto**: secrets de Edge Functions (`RESEND_API_KEY`, `SITE_URL`), configuración de
  Auth (Site URL, redirects, SMTP, plantillas), API keys, configuración de Realtime: anotarlos desde el Dashboard (sin
  copiar valores a archivos versionados).
- **Edge Function `daily-agenda`**: su código está en el repo (`main` = v1.5.1; la rama = v1.6, compatible con ambas).
- **Netlify**: el deploy de v1.5.1 queda publicado y es el destino de rollback (no depende de este backup).

### 6.3 Verificación de integridad (la hace el script, sin conexión)
`pg_restore --list` de cada dump (TOC legible), filas por tabla DENTRO del dump comparadas con `counts_live.txt` (se
informan solo las diferencias; una tabla escrita entre el conteo y el dump puede diferir en pocas filas — repetir si
pasa), y `SHA256SUMS.txt` con hash y tamaño de cada archivo. Antes de usar el backup: recalcular el SHA-256.

### 6.4 Prueba de restauración (descartable; no toca QA ni producción) 🔒
Cluster Postgres 17 local y temporal con los binarios de `D:\tools\pgsql-17.11\bin`:
1. `initdb -D <tmp>\pgdata -U postgres --auth=trust` y `pg_ctl -D <tmp>\pgdata -o "-p 54329" start` (solo localhost).
2. Crear los roles y el esquema mínimos que Supabase provee y el dump referencia: roles `anon`, `authenticated`,
   `service_role` (nologin) y esquema `auth` con `auth.uid()` / `auth.role()` / `auth.jwt()` simulados, y tabla
   `auth.users (id uuid primary key)`.
3. `pg_restore -p 54329 -d postgres --no-owner --exit-on-error prod_public_full.dump` y comparar `count(*)` de las tablas
   con `counts_live.txt`; `select max(version) from supabase_migrations.schema_migrations` = `20260926000001`.
4. `pg_ctl stop` y borrar `<tmp>`. Si algo falla por objetos propios de Supabase, documentarlo (no invalida los datos).
Alternativa más fiel: un proyecto Supabase temporal (si el límite de proyectos del plan lo permite), restaurando
`prod_public_full.dump` y `prod_auth_storage_data.dump`, y eliminándolo al terminar.

**Resultado (2026-10-24, backup `prod-v151-20261024-063116`, `BACKUP COMPLETO Y VERIFICADO`):** 9/9 archivos de datos
coinciden con `SHA256SUMS.txt` (`backup.log` difiere porque se sigue escribiendo después de calcular los hashes).
Restauración en un cluster local descartable (`%TEMP%\planner-restore-test-20261024`, 127.0.0.1:54329, script
`C:\Users\ldoli\Documents\planner-backups\restore_test_v151.ps1`) con roles y `auth.uid/role/jwt` simulados y
`auth.users` mínima (mismas columnas del dump): `pg_restore` sin errores; 16 tablas de `public` + `supabase_migrations`
con 307 filas, **todas iguales** a los conteos en vivo; última migración `20260926000001`; 26 políticas RLS, 15 tablas con
RLS, 11 funciones, 9 triggers y 23 claves foráneas iguales al dump, 0 restricciones sin validar (todas las FK, incluida
`profiles → auth.users`, validaron con los 12 usuarios); privilegios de `anon`/`authenticated`/`service_role`: 131 de
tabla + 4 de columna (`profiles`), idénticos al dump. Fuera de la prueba: el resto de `auth` (identidades) y `storage`
(metadatos) sin su DDL de Supabase (sus filas se verificaron dentro del dump), y lo listado en §6.2.

### 6.5 Recuperación ante una migración fallida (en orden de preferencia)
1. Las migraciones de v1.6 son transaccionales y abortan sin cambios ante cualquier guarda: si `db push` falla, la base
   queda como estaba (verificar con el pre-flight).
2. Si se aplicaron y v1.6 tiene problemas: `ROLLBACK.md` (bloque A, sin pérdida de datos; ensayado en B11).
3. Solo ante pérdida o corrupción de datos (decisión explícita 🔒): restaurar las tablas afectadas desde
   `prod_public_full.dump` con `pg_restore --data-only -t <tabla>` (o completo en un proyecto nuevo), y `auth` desde
   `prod_auth_storage_data.dump`. Nunca restaurar sobre producción sin un export previo del estado actual.

## 7. Riesgos residuales

- **Emails de colaboración postergados hasta F5** (D1): ni comentarios ni avisos de estado envían email; las
  notificaciones internas sí funcionan. Cobertura automatizada de la pausa: EM01–EM10 e IT01–IT12 en QA (sin render de
  UI ni entrega de Realtime al navegador, cubiertos antes por R1–R9 y el smoke de B11).
- **Aviso por email al aprobar retirado** respecto de v1.5.0/1.5.1: el staff deja de tenerlo (no se anuncia en Novedades).
- **Búsqueda global sin índice** (regex sin acentos): escanea `publications` bajo RLS; OK al volumen actual.
- **`internal_notes`** sigue en la tabla, legible por API para el Client User como en v1.5.1 (ya no viaja por Realtime).
- **Pestañas abiertas con v1.5.1** fallan en acciones hasta recargar tras el deploy (y al revés en un rollback).
- **Pre-flight transaccional en producción** (`build-dry-run.mjs`, QA_STRATEGY §A) cubre solo el core y no las 9
  migraciones: no se usa; lo reemplazan B11, las guardas de cada migración, el pre-flight de solo lectura y el backup.
