import { createClient } from "@/lib/supabase/client";
import { isMissingV16Object, V16_PENDING_MESSAGE } from "@/lib/editorial-transitions";
import { notificationCursorFilter, type NotificationCursor } from "@/lib/notification-text";
import type { AppNotification, NotificationType } from "@/types";

/**
 * Bandeja interna de v1.6 (Fase 4) — acceso desde el NAVEGADOR (cliente Supabase del usuario, mismas RLS/RPCs).
 *
 * Por qué no server actions: el router de Next descarta una server action en curso cuando empieza una navegación
 * (app-router-instance.js: `pending.discarded = true`) y su promesa NUNCA se resuelve ni se rechaza. El provider
 * las usaba para releer cada evento Realtime y el contador: si llegaba una notificación mientras se navegaba (abrir
 * una publicación, cambiar de espacio, /p/<id>), se perdían el contador y el toast hasta recargar. Desde el
 * navegador las consultas no pasan por esa cola.
 *
 * La base es la fuente de verdad:
 *   * Lectura: RLS `notifications_select_own` (recipient_id = auth.uid()) — nadie ve notificaciones ajenas ni de
 *     otros clientes, aunque manipule el request.
 *   * Escritura: solo RPCs (mark_notifications_read / mark_publication_notifications_read), que vuelven a filtrar
 *     por auth.uid(). Las notificaciones las crean el trigger de estados y las RPCs de comentarios (ver
 *     supabase/migrations/20261008000001_v16_collab_core.sql), con las reglas de destinatarios ahí definidas.
 * Mientras esa migración no esté aplicada, todo devuelve `unavailable: true` y un mensaje — nunca un éxito
 * simulado. La tabla/RPCs no están en database.types.ts todavía: cliente casteado (mismo criterio que
 * lib/actions/comments.ts).
 */

interface PostgrestLikeError {
  code?: string;
  message: string;
}

interface NotificationRow {
  id: string;
  type: NotificationType;
  client_id: string | null;
  publication_id: string | null;
  comment_id: string | null;
  actor_name: string | null;
  actor_avatar_url: string | null;
  publication_title: string | null;
  read_at: string | null;
  created_at: string;
}

interface UntypedQuery<T> extends PromiseLike<{ data: T | null; error: PostgrestLikeError | null; count?: number | null }> {
  eq(column: string, value: string): UntypedQuery<T>;
  is(column: string, value: null): UntypedQuery<T>;
  or(filters: string): UntypedQuery<T>;
  order(column: string, opts: { ascending: boolean }): UntypedQuery<T>;
  limit(count: number): UntypedQuery<T>;
  maybeSingle(): Promise<{ data: (T extends (infer R)[] ? R : T) | null; error: PostgrestLikeError | null }>;
}

interface V16Client {
  from(table: "notifications"): {
    select(columns: string, opts?: { count: "exact"; head: true }): UntypedQuery<NotificationRow[]>;
  };
  rpc(fn: "mark_notifications_read", args: { p_ids: string[] | null }): Promise<{ data: number | null; error: PostgrestLikeError | null }>;
  rpc(
    fn: "mark_publication_notifications_read",
    args: { p_publication_id: string }
  ): Promise<{ data: number | null; error: PostgrestLikeError | null }>;
}

const COLUMNS = "id, type, client_id, publication_id, comment_id, actor_name, actor_avatar_url, publication_title, read_at, created_at";
const MAX_PAGE = 50;

async function db(): Promise<V16Client> {
  return createClient() as unknown as V16Client;
}

function mapRow(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    type: row.type,
    clientId: row.client_id,
    publicationId: row.publication_id,
    commentId: row.comment_id,
    actorName: row.actor_name,
    actorAvatarUrl: row.actor_avatar_url,
    publicationTitle: row.publication_title,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

function failure(error: PostgrestLikeError) {
  return isMissingV16Object(error.code)
    ? { error: V16_PENDING_MESSAGE, unavailable: true }
    : { error: error.message, unavailable: false };
}

export interface NotificationsPage {
  items: AppNotification[];
  /** Total de no leídas según la base (no se deriva de lo cargado en el navegador). */
  unreadCount: number;
  hasMore: boolean;
  error: string | null;
  unavailable: boolean;
}

/**
 * Página de la bandeja propia, más recientes primero. Orden y cursor COMPUESTOS (created_at DESC, id DESC):
 * varias notificaciones con el mismo created_at (misma transacción) nunca se saltean ni se repiten entre páginas.
 * `before` = el último ítem ya cargado. `unreadOnly` (v1.6, bandeja de pendientes): solo las no leídas.
 */
export async function listNotifications(
  options: { before?: NotificationCursor; limit?: number; unreadOnly?: boolean } = {}
): Promise<NotificationsPage> {
  const client = await db();
  const limit = Math.min(Math.max(options.limit ?? 20, 1), MAX_PAGE);

  let query = client
    .from("notifications")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (options.unreadOnly) query = query.is("read_at", null);
  if (options.before) {
    const cursorFilter = notificationCursorFilter(options.before);
    if (!cursorFilter) return { items: [], unreadCount: 0, hasMore: false, error: "Cursor de paginación inválido.", unavailable: false };
    query = query.or(cursorFilter);
  }

  const [{ data, error }, unread] = await Promise.all([query, countUnread(client)]);
  if (error) return { items: [], unreadCount: 0, hasMore: false, ...failure(error) };
  if (unread.error) return { items: [], unreadCount: 0, hasMore: false, ...failure(unread.error) };

  const rows = data ?? [];
  return {
    items: rows.slice(0, limit).map(mapRow),
    unreadCount: unread.count,
    hasMore: rows.length > limit,
    error: null,
    unavailable: false,
  };
}

async function countUnread(client: V16Client): Promise<{ count: number; error: PostgrestLikeError | null }> {
  const { count, error } = await client.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  return { count: count ?? 0, error };
}

export interface NotificationResult {
  notification: AppNotification | null;
  unreadCount: number | null;
}

/** Una notificación puntual + el contador vigente. Lo usa la UI al recibir un evento Realtime: el payload es solo
 * una señal, los datos se releen acá bajo RLS. */
export async function getNotification(id: string): Promise<NotificationResult> {
  const client = await db();
  const [{ data }, unread] = await Promise.all([
    client.from("notifications").select(COLUMNS).eq("id", id).maybeSingle(),
    countUnread(client),
  ]);
  return { notification: data ? mapRow(data) : null, unreadCount: unread.error ? null : unread.count };
}

export interface MarkReadResult {
  error: string | null;
  unavailable: boolean;
  /** Contador vigente después de marcar (fuente de verdad para la campanita). */
  unreadCount: number | null;
}

/** Marca como leídas las propias (`ids`) o todas (`null`). */
export async function markNotificationsRead(ids: string[] | null): Promise<MarkReadResult> {
  const client = await db();
  const { error } = await client.rpc("mark_notifications_read", { p_ids: ids });
  if (error) return { unreadCount: null, ...failure(error) };
  const unread = await countUnread(client);
  return { error: null, unavailable: false, unreadCount: unread.error ? null : unread.count };
}

/** Al abrir una publicación: marca como leídas las notificaciones propias asociadas a ella. */
export async function markPublicationNotificationsRead(publicationId: string): Promise<MarkReadResult> {
  const client = await db();
  const { data, error } = await client.rpc("mark_publication_notifications_read", { p_publication_id: publicationId });
  if (error) return { unreadCount: null, ...failure(error) };
  if (!data) return { error: null, unavailable: false, unreadCount: null };
  const unread = await countUnread(client);
  return { error: null, unavailable: false, unreadCount: unread.error ? null : unread.count };
}
