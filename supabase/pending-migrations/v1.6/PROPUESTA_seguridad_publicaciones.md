# Propuesta — Seguridad de publicaciones: eventos DELETE en vivo y campos internos (v1.6)

Estado: **propuesta para aprobación**. Sin código ni SQL aplicados.

## 1. Exposición de ids en eventos DELETE (`20261015000001`)

**Situación.** Al publicar `public.publications` en Realtime, INSERT/UPDATE se entregan solo a quien pasa la RLS
(`publications_manage`: Super Admin o AM asignado; `publications_select_own`: Client User de ese cliente). Los
DELETE no pasan por RLS ni filtros y, con replica identity DEFAULT, traen solo el `id`. Cualquier usuario
autenticado que se suscriba a DELETE de `publications` puede ver **uuids de publicaciones borradas de otros
clientes y cuándo** — nunca título, copy, cliente ni ningún otro dato. La exposición existe por el solo hecho de
publicar la tabla (no depende de que la app se suscriba). Es el mismo riesgo ya aceptado y documentado para
`publication_comments`, `notifications`, `publication_status_events` y `publication_comment_reactions`
(`20261008000002`).

**Gravedad: baja** (identificadores aleatorios sin contenido; revela actividad de borrado y volumen).

**Alternativa sin exposición (si se quiere eliminar del todo).** No publicar `publications`; en su lugar una tabla
de señales:
```sql
create table public.publication_changes (
  id bigint generated always as identity primary key,
  publication_id uuid not null,            -- sin FK: sobrevive al borrado de la publicación
  client_id uuid not null references public.clients (id) on delete cascade,
  kind text not null check (kind in ('upsert', 'delete')),
  changed_at timestamptz not null default now()
);
-- RLS: select para authenticated con can_view_client(client_id). Sin escritura para usuarios.
-- Trigger AFTER INSERT OR UPDATE OR DELETE en publications que inserta (publication_id, client_id, kind) y borra las
-- señales de más de 1 día (limpieza barata, sin cron).
```
- Publicar solo `publication_changes` y escuchar solo sus INSERT (filtrados por `client_id` en el Planner): **todo**
  evento pasa por RLS, incluido el de borrado. Los DELETE de limpieza solo exponen el `id` bigint de la señal.
- `lib/use-publications-live.ts` cambia solo la fuente (misma lógica: `upsert` → releer; `delete` → quitar), sin
  romper la sincronización.
- Costo: una tabla, un trigger en `publications` (el único punto de contacto con el flujo de v1.5.1, igual que el de
  estados), migración/rollback/pruebas nuevas.

**Recomendación:** aplicar `20261015000001` en QA tal como está (riesgo bajo, consistente con lo ya aceptado) para
validar la experiencia; decidir antes de producción si se reemplaza por `publication_changes`.

## 2. Campos internos legibles por el Client User desde la API

> **Actualización 2026-10-13 — reemplazada por decisión de producto:** Notas internas deja de existir (sin tabla
> separada): código retirado de v1.6 y columna retirada por `pending-migrations/v1.6/20261016000001_v16_drop_publications_internal_notes.sql`.
> `trello_url` es información compartida con el cliente: sigue visible para el Client User y sin restricciones.
> Lo que sigue queda solo como antecedente.


**Situación.** `publications_select_own` es una política de FILA: el Client User puede leer **todas las columnas**
de las publicaciones de su cliente con una consulta directa a la API (no desde la interfaz, que no las muestra):
- `internal_notes` (notas internas de la agencia) — **sensible**.
- `trello_url` (v1.6, link al tablero de la agencia) — probablemente interno.
- `cta`, `external_url`, `drive_folder_id` — legado/no mostrados.
La vista de solo lectura del Client User usa: título, copy, fecha/hora, estado, calendario, campaña, tipo,
destinos y `drive_folder_url`. Con `20261015000001`, el mismo dato además viaja en los eventos en vivo (misma
exposición, otro canal). Es una situación **previa a v1.6** (v1.5.1 ya la tiene).

**Gravedad: media** (exposición de notas internas a usuarios del propio cliente; no cruza clientes).

**Por qué no alcanza con permisos de columna.** Staff y Client User usan el mismo rol de Postgres
(`authenticated`): un `revoke select (internal_notes)` también se lo quitaría al staff.

**Propuesta recomendada: separar los campos internos en una tabla propia.**
```sql
create table public.publication_internal (
  publication_id uuid primary key references public.publications (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  internal_notes text,
  trello_url text check (/* misma regla que publications.trello_url */ ...),
  updated_at timestamptz not null default now()
);
-- RLS: select/insert/update solo can_manage_client(client_id) (staff). El Client User no tiene política → no la ve.
```
Despliegue en dos pasos (v1.5.1 lee y escribe `publications.internal_notes`):
1. Con v1.6: crear la tabla, copiar los datos y mantenerla sincronizada (trigger en ambas direcciones o la app v1.6
   escribiendo en las dos) mientras v1.5.1 pueda seguir activa (rollback). La app v1.6 lee de la tabla nueva.
2. Cuando v1.6 quede estable: vaciar `publications.internal_notes` / `trello_url` (y, más adelante, quitar las
   columnas). Recién ahí la exposición desaparece de la API y de Realtime.

**Alternativa más simple, parcial:** quitar `publications_select_own` y exponer al Client User una vista
`security_barrier` sin esos campos. Implica cambiar todas las consultas del portal y de `/p/<id>`; más invasiva.

**Decisiones necesarias:** (a) ¿avanzar con la tabla separada? (b) ¿`trello_url` es interno? (c) ¿se hace antes del
deploy de v1.6 o como mejora inmediata posterior (la exposición ya existe en producción con v1.5.1)?
