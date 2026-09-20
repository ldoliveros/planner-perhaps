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
