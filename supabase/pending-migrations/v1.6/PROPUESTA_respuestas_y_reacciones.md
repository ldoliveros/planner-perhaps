# Propuesta técnica — Respuestas con contexto y reacciones en comentarios (v1.6)

Estado: **aprobada; migraciones preparadas** (`20261014000001_v16_comment_replies.sql`, `20261014000002_v16_comment_reactions.sql`), sin aplicar ni dry-run. Diferencias con esta propuesta: reacciones con `set_comment_reaction(p_comment_id, p_emoji, p_active)` idempotente (en vez de toggle) y disponibles En revisión, Aprobada y Publicada; alcance de reacciones y misma publicación de respuestas garantizados por triggers. Nada de esto toca
notificaciones, menciones, el contador de no leídos (`publication_comment_reads`) ni los permisos actuales.

---

## A. «Responder con contexto» persistente

### Diagnóstico
`publication_comments` no tiene ninguna columna que relacione un comentario con otro, y
`add_publication_comment(p_publication_id, p_body, p_mentions, p_request_id)` no recibe ese dato. Persistir "este
comentario responde a aquel" **requiere migración**. Hoy (sin migración) el editor muestra "Respondiendo a …"
mientras se escribe, pero al publicar solo queda la mención — no se muestra ninguna referencia que se perdería al
recargar.

### Migración propuesta — `20261014000001_v16_comment_replies.sql`
1. Columna nueva, nullable, sin default (no toca filas existentes):
   ```sql
   alter table public.publication_comments
     add column reply_to_comment_id uuid references public.publication_comments (id) on delete set null;
   create index publication_comments_reply_to_idx on public.publication_comments (reply_to_comment_id);
   ```
   `on delete set null`: los comentarios no se borran físicamente (soft delete), pero si una publicación se elimina
   en cascada no quedan referencias colgadas.
2. `add_publication_comment` con un parámetro opcional `p_reply_to uuid default null`. Como cambia la firma, se
   hace `drop function … (uuid, text, uuid[], uuid)` + `create function … (uuid, text, uuid[], uuid, uuid)` en la
   misma transacción, re-aplicando `revoke … from public, anon` / `grant … to authenticated`. La app ya llama con
   argumentos nombrados (supabase-js), así que una llamada sin `p_reply_to` sigue funcionando.
   Validación dentro de la RPC (además de las actuales): si `p_reply_to` no es null, tiene que ser un comentario
   **de la misma publicación**; si no, se ignora (null) — nunca se referencia un comentario de otra publicación o
   cliente. Puede apuntar a un comentario eliminado (la UI muestra "Comentario eliminado").
3. Sin cambios de RLS: la columna se lee con la policy existente `publication_comments_select`
   (`can_view_client`). Realtime ya publica la tabla.
4. Rollback (bloque nuevo en `rollback_v16.sql`): recrear la firma de 4 argumentos tal como está en
   `20261008000001` y `alter table … drop column reply_to_comment_id` (pierde solo las referencias).
5. Pruebas (`security_checks.sql`, sección nueva): responder con un id de otra publicación → queda null; con un id de
   otro cliente → null; reintento con el mismo `request_id` → mismo comentario; anon sin ejecución.

### Frontend (después de aplicarla)
- `addPublicationComment(…, replyToId)`; `CommentRow`/`PublicationComment` con `replyToCommentId`.
- Encima del mensaje nuevo, una línea discreta: "↩ En respuesta a **Nombre**: extracto…" (o "a un comentario
  eliminado"), que al tocarla hace scroll y resalta el original (el mismo mecanismo que ya usa el bloque del editor).
- Lista única y cronológica; sin hilos.

---

## B. Reacciones con emojis (👍 ❤️ 👏 🎉 😂 👀)

### 1. Esquema — `20261014000002_v16_comment_reactions.sql`
```sql
create table public.publication_comment_reactions (
  comment_id uuid not null references public.publication_comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '👏', '🎉', '😂', '👀')),
  -- Derivados en la RPC desde el comentario (aislamiento por cliente en la policy y filtro Realtime).
  publication_id uuid not null references public.publications (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  -- Quitar = active false (UPDATE), no DELETE: ver Realtime.
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (comment_id, user_id, emoji)
);
create index on public.publication_comment_reactions (publication_id) where active;
```
- La PK `(comment_id, user_id, emoji)` impide duplicar el mismo emoji; distintos emojis del mismo usuario sí.
- El CHECK limita a los seis emojis aprobados (cambiar la lista = migración).

### 2. RLS y funciones
- RLS: `select` para `authenticated` con `can_view_client(client_id)` (como los comentarios). Sin policies de
  escritura; `revoke all` + `grant select`.
- `toggle_comment_reaction(p_comment_id uuid, p_emoji text) returns boolean` (security definer, `authenticated`):
  `auth.uid()` activo (`is_active_user`), `can_view_client(client_id) is not true` → 42501, comentario existente y
  **no eliminado**, emoji válido; upsert alternando `active`. Devuelve el estado final.
- Decisión pendiente: ¿reaccionar solo En revisión (como comentar) o en cualquier estado (el historial queda
  visible)? Propuesta: **igual que comentar** (solo En revisión), para no abrir una vía de escritura nueva fuera de
  revisión. Es una línea en la RPC.
- Sin notificaciones: la RPC no llama a `fan_out_comment` ni a nada del outbox.

### 3. Integración con comentarios
- Carga: `listPublicationComments` agrega una consulta `select comment_id, user_id, emoji from
  publication_comment_reactions where publication_id = $1 and active` (RLS) y la app agrupa por comentario/emoji
  (`👍 3`, con "mías" = `user_id = currentUserId`). Sin RPC de lectura.
- Toggle optimista en `usePublicationComments` con reversión si la RPC falla.

### 4. Realtime sin suscripciones extra
- Agregar la tabla a `supabase_realtime` (mismo patrón con guards que `20261008000002`).
- **Mismo canal** que ya abre `usePublicationComments` para la publicación: un `.on("postgres_changes", { table:
  "publication_comment_reactions", filter: "publication_id=eq.<id>" })` más. Cero canales nuevos.
- Por qué `active` y no DELETE: los eventos DELETE de Realtime no pasan por RLS ni por el filtro de columnas (con
  replica identity por defecto solo traen la PK), así que llegarían a suscriptores de otros clientes. Con UPDATE el
  evento sí se filtra por RLS y por `publication_id`.

### 5. Migración, rollback y pruebas
- Migración en `pending-migrations/v1.6/` hasta autorizarla; dry-run con el guard (mismo esquema que
  `dry-run-comment-reads`) y luego push solo en QA.
- Rollback: `drop function toggle_comment_reaction`, sacar la tabla de Realtime, `drop table` (pierde solo
  reacciones).
- `security_checks_comment_reactions.sql` (ROLLBACK): toggle propio on/off; mismo emoji no duplica; emoji fuera de
  la lista → error; comentario eliminado → error; otro cliente → 42501; un usuario no puede alterar reacciones de
  otro (la RPC usa `auth.uid()`); sin escritura directa; anon sin ejecución; RLS de lectura entre clientes.

### 6. Componentes visuales
- Debajo del mensaje, en la fila de acciones: chips `👍 3` (redondeados, borde sutil, fondo blanco; las propias con
  fondo `#EEF3FA` y borde un tono más marcado). Tocar un chip agrega/quita la propia. Tooltip con quiénes
  reaccionaron (nombres ya disponibles: autores/mencionables).
- Botón discreto "Agregar reacción" (ícono `SmilePlus`) que abre un Popover con los seis emojis en una fila.
- Sin chips si no hay reacciones; comentarios eliminados sin reacciones ni botón.

---

## Autorizaciones necesarias
1. Aprobar el diseño A (columna `reply_to_comment_id` + nueva firma de `add_publication_comment`) para preparar el
   SQL, su dry-run en QA y luego aplicarlo en QA.
2. Aprobar el diseño B y decidir si las reacciones se limitan a "En revisión".
3. En producción, ambas migraciones se aplicarían junto con el resto de v1.6 antes del deploy.
