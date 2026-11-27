import type { AppNotification, NotificationDetails, NotificationType } from "@/types";

/** Avisos de la conversación (se dan por leídos al VER los comentarios); el resto, al abrir la publicación. */
export const CONVERSATION_NOTIFICATION_TYPES: readonly NotificationType[] = ["comment", "mention", "reply"];

export function isConversationNotification(type: NotificationType): boolean {
  return CONVERSATION_NOTIFICATION_TYPES.includes(type);
}

/** "30/11 a las 18:00" / "30/11" (fecha y hora de pared del Planner, sin conversión de huso). */
export function formatScheduleShort(schedule: NonNullable<NotificationDetails["schedule"]>): string | null {
  const match = schedule.date ? /^(\d{4})-(\d{2})-(\d{2})/.exec(schedule.date) : null;
  if (!match) return null;
  const day = `${match[3]}/${match[2]}`;
  const time = schedule.time && /^\d{2}:\d{2}/.test(schedule.time) ? schedule.time.slice(0, 5) : null;
  return time ? `${day} a las ${time}` : day;
}

/** Texto de una notificación interna (v1.6) — puro, sin React, testeable. */
export function describeNotification(
  n: Pick<AppNotification, "type" | "actorName" | "publicationTitle"> & { details?: NotificationDetails | null }
): string {
  const actor = n.actorName?.trim() || "Alguien";
  const title = n.publicationTitle?.trim() ? `«${n.publicationTitle.trim()}»` : "una publicación";
  const schedule = n.details?.schedule;
  const when = schedule ? formatScheduleShort(schedule) : null;
  const rescheduled = schedule ? (when ? `para el ${when}` : null) : undefined;
  // Fecha nueva agregada a otro aviso del mismo guardado.
  const scheduleSuffix = schedule === undefined ? "" : when ? `. Nueva fecha: ${when}` : ". Se quitó la fecha de publicación";

  switch (n.type) {
    case "comment":
      return `${actor} comentó en ${title}`;
    case "mention":
      return `${actor} te mencionó en ${title}`;
    case "reply":
      return `${actor} te respondió en ${title}`;
    case "review_requested":
      return `${actor} envió ${title} a revisión${scheduleSuffix}`;
    case "approved_by_client":
    case "approved_by_agency":
      return `${actor} aprobó ${title}${scheduleSuffix}`;
    case "published":
      return `${actor} marcó ${title} como publicada${scheduleSuffix}`;
    case "discarded":
      return `${actor} marcó ${title} como descartada${scheduleSuffix}`;
    case "created_by_client":
      return `${actor} creó ${title}${scheduleSuffix}`;
    case "approval_invalidated": {
      const base =
        n.details?.reason === "status"
          ? n.details.status === "draft"
            ? `${actor} volvió ${title} a Borrador: la aprobación anterior quedó sin efecto`
            : `${actor} volvió ${title} a En revisión: necesita una nueva revisión`
          : `${actor} actualizó ${title}: necesita una nueva revisión`;
      return `${base}${scheduleSuffix}`;
    }
    case "rescheduled":
      return rescheduled ? `${actor} reprogramó ${title} ${rescheduled}` : `${actor} quitó la fecha de publicación de ${title}`;
    default:
      return `Novedades en ${title}`;
  }
}

/**
 * Ruta universal de la publicación de una notificación (resuelve el Planner según el rol, ver app/p/[id]).
 * Desde una notificación la Vista de Publicación abre en la pestaña Comentarios.
 */
export function notificationHref(n: Pick<AppNotification, "publicationId"> & { publicationUnavailable?: boolean }): string | null {
  return n.publicationId && !n.publicationUnavailable ? `/p/${n.publicationId}?tab=comments` : null;
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
