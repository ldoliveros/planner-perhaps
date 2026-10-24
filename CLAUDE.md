@AGENTS.md

## Entorno QA persistente

Supabase es el mismo proyecto que producción (no hay staging separado). Para
pruebas funcionales del Planner, usar SIEMPRE este entorno QA persistente en
vez de crear/borrar cuentas ad-hoc o tocar clientes reales:

- **Cliente**: `QA Sandbox` (slug `qa-sandbox`) — todos los datos dentro de
  este cliente (calendarios, cuentas, campañas, publicaciones) son
  descartables: se pueden crear, editar o eliminar libremente durante una
  prueba.
- **Calendarios**: `QA General`, `QA Alterno`.
- **Cuentas/destinos**: el handle es obligatorio y se guarda SIN `@`
  (identificador principal; el nombre es opcional). Instagram ×2
  (`qa.sandbox`, `qa.sandbox.alt`), Facebook (`qa.sandbox`, nombre `QA Sandbox`
  — mismo handle que el Instagram principal, a propósito, para probar que la
  unicidad es por cliente + plataforma), LinkedIn (`qa-sandbox`).
- **Campaña de ejemplo**: `QA Lanzamiento`.
- **Usuarios QA** (persistentes, no eliminar):
  - `qa-super-admin@perhaps-planner-qa.com` — rol `super_admin`.
  - `qa-account-manager@perhaps-planner-qa.com` — rol `account_manager`,
    asignado ÚNICAMENTE al cliente QA Sandbox.
  - `qa-client-user@perhaps-planner-qa.com` — rol `client`, pertenece
    ÚNICAMENTE al cliente QA Sandbox.

Las contraseñas de estos usuarios NO están en este repo ni en ningún archivo
versionado (regla dura: nunca commitear secretos). Antes de loguear como un
usuario QA, resetear su contraseña con el service role
(`supabase.auth.admin.updateUserById(id, { password })`) usando una
contraseña temporal generada en el momento — nunca reutilizar ni persistir
esa contraseña más allá de la sesión de pruebas.

Reglas de uso:
- No usar clientes reales para QA cuando la prueba se pueda hacer con
  `QA Sandbox`.
- No modificar usuarios reales para probar roles/permisos.
- Los usuarios QA y el cliente `QA Sandbox` son persistentes — no
  eliminarlos al terminar una tarea. Limpiar solo los datos temporales de
  esa prueba puntual si pueden interferir con pruebas futuras.
- Antes de crear una cuenta QA nueva, comprobar si ya existe (buscar por
  email en `profiles` o por slug `qa-sandbox` en `clients`).
- Cualquier cambio de schema, RLS, configuración de Auth, roles globales o
  recursos fuera del cliente QA sigue requiriendo autorización explícita del
  usuario antes de ejecutarse, igual que cualquier otra migración.

## Planner v1.6.0 (rama `feature/v1.6-collaboration`, commiteada; sin push, merge ni deploy)

Producción sigue en v1.5.1 y su base no tiene ninguna migración de v1.6. El QA de v1.6 NO usa el QA Sandbox
del proyecto compartido: usa el proyecto aislado `planner-qa-v16` (`wxkbkdoaohywqabmyqjk`), con su propio
QA Sandbox y los mismos usuarios QA. Toda operación de base contra él pasa por el guard
`node supabase/qa/v1.6/qa-db.mjs` (nunca el CLI enlazado del repo, que apunta a producción). La app local de
la rama usa solo `.env.development.local` (QA, `RESEND_API_KEY` vacía).

Detalle y registro de avance: `supabase/pending-migrations/v1.6/README.md` (migraciones y orden),
`supabase/qa/v1.6/QA_STRATEGY.md` (QA y resultados), `supabase/rollback/v1.6/ROLLBACK.md` (rollback) y
`supabase/rollback/v1.6/DEPLOY_RUNBOOK.md` (despliegue a producción y decisiones previas D1–D4).

Implementado en la rama (2026-10-09):
- Colaboración: comentarios con menciones (solo En revisión), aprobación del cliente con versión, historial
  de estados, notificaciones en tiempo real (campanita, drawer lateral, historial), bloqueo optimista al guardar.
- Modal de publicación con pestañas: Edición/Comentarios (staff) y Publicación/Comentarios (Client User);
  altura estable, ambos paneles montados (no se pierden cambios sin guardar) y ocultamiento inmediato.
- Link a Trello (`publications.trello_url`) en lugar de CTA/URL en la interfaz y en el CSV. `cta` y
  `external_url` se conservan en la base y `savePublication` ya no los escribe (no pisar datos históricos).
- Navegación de /admin: Inicio (`/admin`), Publicaciones (vista general), Espacios (abre el Planner individual
  existente `/admin/clients/<id>/planner`; RLS decide qué clientes ve cada rol) y Administrar clientes
  (`/admin/clients`).
- Campanita + avatar (solo foto o inicial) unificados arriba a la derecha en todo /admin, montados una vez en
  el layout (`lib/admin-shell.ts`). El portal del Client User no cambió.
- Dashboard de Inicio (`/admin`, solo Super Admin y Account Manager), aprobado funcional y visualmente en
  desktop y mobile: filtros Espacio y Período en la URL (`?space=&month=`), indicadores (activas sin
  descartadas, en revisión, aprobadas, publicadas), distribución por estado, próximas publicaciones (abren con
  `/p/<id>`) y notificaciones sin leer del mismo `NotificationsProvider` que la campanita. Los indicadores y
  segmentos abren Publicaciones en Lista con período, espacio y `?status=`. Cálculos puros en `lib/dashboard.ts`;
  datos con las consultas `fetch*` de `lib/supabase/queries.ts` (informan el error de Supabase; las `list*` de
  siempre conservan su comportamiento). Con un espacio elegido, el contador de notificaciones se calcula sobre las
  20 más recientes y se muestra como "N+" si puede haber más.
- Tablero (Kanban, `?view=board`, `components/calendar/board-view.tsx`): 5 columnas fijas por estado sobre el mes
  elegido y los mismos filtros que Lista; drag & drop (solo mouse, solo staff) con el mismo flujo de cambio de estado
  que el `•••` (`use-status-change-flow.tsx`). Client User: solo lectura. Última funcionalidad de v1.6: desde acá solo
  correcciones de bugs, seguridad y compatibilidad.

Reglas vigentes:
- Antes del deploy de v1.6, aplicar en producción las migraciones de `supabase/migrations/` de v1.6, incluida
  `20261009000001` (Trello): sin esa columna cada guardado de publicación falla.
- F3/F4 (worker y cron de emails) y el envío de emails siguen postergados: sus migraciones quedan en
  `supabase/pending-migrations/v1.6/`; no instalar `pg_cron`/`pg_net` ni configurar Resend sin autorización.
  Emails de colaboración (comentarios, menciones, respuestas, avisos de estado) postergados para F5: la app no los
  ofrece y `20261018000001_v16_pause_collab_emails` (aplicada en QA; 10.ª migración de producción) no los encola
  hasta encender el flag `v16_collab_emails`.
- El flag `v16_notifications` se activa por cliente con `enabled = false` + `client_ids`; `enabled = true`
  activa v1.6 para TODOS los clientes (solo en el lanzamiento).
- QA cerrado (2026-10-14): regresión manual R1–R9 aprobada, ensayo real de rollback B11 aprobado en QA y pausa de
  emails validada (EM01–EM10, IT01–IT12). Pendiente solo F5 (worker/cron de emails), fuera de v1.6. Despliegue a
  producción: `supabase/rollback/v1.6/DEPLOY_RUNBOOK.md` (10 migraciones; backup manual verificado y restaurado).

## Eficiencia de desarrollo y QA

Regla permanente: evitar trabajo repetitivo y consumo innecesario de sesión.
Aplica automáticamente a todas las tareas.

Durante una tarea:

- Leer únicamente los archivos necesarios para implementar el cambio.
- No hacer auditorías globales salvo que sean necesarias.
- No releer archivos completos repetidamente si no cambiaron.
- Agrupar cambios relacionados antes de validar.
- No ejecutar `tsc`/`eslint`/`build` después de cada modificación.
- Usar el QA Sandbox persistente; no crear usuarios QA nuevos.
- Reutilizar sesiones QA existentes cuando sea posible.
- Hacer QA proporcional al riesgo del cambio.
- Evitar probar múltiples variantes equivalentes del mismo comportamiento.
- Elegir un flujo principal para QA exhaustivo y smoke tests para variantes.
- No repetir regresiones ya cubiertas salvo que el cambio pueda afectarlas.

Validación normal de un bloque:

1. Implementación.
2. `tsc --noEmit`.
3. `eslint` sobre archivos modificados, o `eslint .` cuando corresponda.
4. QA dirigido de los comportamientos afectados.
5. `next build` solo al cierre de un bloque importante o cuando el cambio pueda
   afectar el build.

Validación exhaustiva: reservarla para checkpoints/release, antes de
push/deploy/tag.

Si `tsc`, `eslint` o QA encuentran un error: corregirlo y volver a ejecutar
únicamente la validación relevante. No repetir pruebas exitosas sin una razón
técnica concreta.
