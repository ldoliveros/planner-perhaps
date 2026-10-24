import type { AppNotification, NotificationType } from "@/types";

/** Texto de una notificación interna (v1.6) — puro, sin React, testeable. */
export function describeNotification(n: Pick<AppNotification, "type" | "actorName" | "publicationTitle">): string {
  const actor = n.actorName?.trim() || "Alguien";
  const title = n.publicationTitle?.trim() ? `«${n.publicationTitle.trim()}»` : "una publicación";
  const templates: Record<NotificationType, string> = {
    comment: `${actor} comentó en ${title}`,
    mention: `${actor} te mencionó en ${title}`,
    review_requested: `${actor} envió ${title} a revisión`,
    approved_by_client: `${actor} aprobó ${title}`,
    approved_by_agency: `${actor} aprobó ${title}`,
  };
  return templates[n.type] ?? `Novedades en ${title}`;
}

/**
 * Ruta universal de la publicación de una notificación (resuelve el Planner según el rol, ver app/p/[id]).
 * Desde una notificación la Vista de Publicación abre en la pestaña Comentarios.
 */
export function notificationHref(n: Pick<AppNotification, "publicationId">): string | null {
  return n.publicationId ? `/p/${n.publicationId}?tab=comments` : null;
}

/** "hace 5 min" / "hace 3 h" / fecha corta. `now` inyectable para tests. */
export function formatNotificationAge(iso: string, now: number = Date.now()): string {
  const diffMs = now - Date.parse(iso);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

/** Orden de la bandeja: más reciente primero; empate de created_at -> id descendente (igual que la query). */
export function compareNewestFirst(a: Pick<AppNotification, "createdAt" | "id">, b: Pick<AppNotification, "createdAt" | "id">): number {
  const byDate = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (byDate !== 0) return byDate;
  return a.id === b.id ? 0 : a.id < b.id ? 1 : -1;
}

function sortNewestFirst(list: AppNotification[]): AppNotification[] {
  return list.sort(compareNewestFirst);
}

/** Cursor compuesto de paginación: el último ítem ya cargado (orden created_at DESC, id DESC). */
export interface NotificationCursor {
  createdAt: string;
  id: string;
}

/**
 * Filtro PostgREST (`.or(...)`) para "más viejo que el cursor" con desempate por id:
 *   created_at < c.createdAt  OR  (created_at = c.createdAt AND id < c.id)
 * Los valores van entre comillas dobles: el timestamp tiene ':' '.' '+' que PostgREST reserva.
 * Solo acepta un timestamp ISO y un uuid (lo que devuelve la propia base): cualquier otra cosa se rechaza
 * antes de armar el filtro, así un cursor manipulado no puede inyectar condiciones.
 */
export function notificationCursorFilter(cursor: NotificationCursor): string | null {
  const isoOk = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)?$/.test(cursor.createdAt);
  const uuidOk = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor.id);
  if (!isoOk || !uuidOk) return null;
  const ts = `"${cursor.createdAt}"`;
  return `created_at.lt.${ts},and(created_at.eq.${ts},id.lt.${cursor.id})`;
}

/**
 * Merge de la página más reciente traída de la base sobre lo que ya había en memoria. La base manda:
 *   * cada ítem traído reemplaza al local;
 *   * dentro del rango cubierto por la página (desde su ítem más viejo hacia adelante, mismo orden compuesto
 *     que la query), lo que la base ya no devuelve se descarta (p. ej. borrado en cascada);
 *   * lo más viejo que la página (historial paginado) se conserva.
 */
export function mergeNotificationsPage(
  current: AppNotification[],
  page: AppNotification[],
  pageIsComplete: boolean
): AppNotification[] {
  const byId = new Map<string, AppNotification>();
  const oldestInPage = page.length > 0 ? page.reduce((oldest, item) => (compareNewestFirst(item, oldest) > 0 ? item : oldest)) : null;
  for (const item of current) {
    const insidePageRange = pageIsComplete || (oldestInPage !== null && compareNewestFirst(item, oldestInPage) <= 0);
    if (!insidePageRange) byId.set(item.id, item);
  }
  for (const item of page) byId.set(item.id, item);
  return sortNewestFirst([...byId.values()]);
}

/** Inserta o reemplaza UNA notificación (evento Realtime) sin tocar el resto de la lista. */
export function upsertNotification(current: AppNotification[], item: AppNotification): AppNotification[] {
  return sortNewestFirst([...current.filter((n) => n.id !== item.id), item]);
}

/** Agrega una página MÁS VIEJA (historial) sin duplicar: si un id ya estaba, gana la versión ya cargada. */
export function appendOlderNotifications(current: AppNotification[], older: AppNotification[]): AppNotification[] {
  const known = new Set(current.map((n) => n.id));
  return sortNewestFirst([...current, ...older.filter((n) => !known.has(n.id))]);
}
