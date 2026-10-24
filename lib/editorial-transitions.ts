/**
 * Reglas puras del circuito editorial de v1.6 (sin React ni Supabase) — compartidas por PublicationView,
 * PublicationQuickActions y las Server Actions, y testeables sin base de datos.
 */

/**
 * ¿Hay que confirmar "Enviar a revisión"? Sí cuando el estado elegido es En revisión y lo guardado NO lo es
 * (Editar desde otro estado), o cuando todavía no hay nada guardado (Crear / Duplicar directamente En
 * revisión). Mientras siga En revisión, las ediciones normales no vuelven a preguntar.
 */
export function requiresReviewConfirmation(params: {
  targetStatusId: string;
  /** Estado guardado; null en Crear/Duplicar. */
  savedStatusId: string | null;
  inReviewStatusId: string | undefined;
}): boolean {
  const { targetStatusId, savedStatusId, inReviewStatusId } = params;
  if (!inReviewStatusId || targetStatusId !== inReviewStatusId) return false;
  return savedStatusId !== inReviewStatusId;
}

/** El Client User solo aprueba desde En revisión (la RPC lo vuelve a validar en la base). */
export function canClientApprove(statusKey: string | undefined): boolean {
  return statusKey === "in_review";
}

/**
 * Error de PostgREST/Postgres por un objeto de v1.6 todavía no instalado (migración sin aplicar):
 * PGRST202 función inexistente · PGRST205 / 42P01 tabla inexistente · 42883 firma inexistente.
 */
export function isMissingV16Object(code: string | undefined): boolean {
  return ["PGRST202", "PGRST205", "42P01", "42883"].includes(code ?? "");
}

export const V16_PENDING_MESSAGE = "Esta función de v1.6 todavía no está activa en la base de datos.";

export type SaveConflictKind = "status_changed" | "content_changed" | "not_found";

/**
 * Motivo por el que el UPDATE condicional de un guardado (id + estado original + updated_at original) no
 * afectó filas. Se evalúa contra la fila actual leída después del intento fallido.
 */
export function classifySaveConflict(params: {
  originalStatusId: string;
  originalUpdatedAt: string;
  current: { statusId: string; updatedAt: string } | null;
}): SaveConflictKind {
  const { originalStatusId, originalUpdatedAt, current } = params;
  if (!current) return "not_found";
  if (current.statusId !== originalStatusId) return "status_changed";
  if (!sameTimestamp(current.updatedAt, originalUpdatedAt)) return "content_changed";
  // Misma versión pero 0 filas: RLS bloqueó el UPDATE (sin permiso de edición).
  return "not_found";
}

export function saveConflictMessage(kind: SaveConflictKind, currentStatusLabel?: string | null): string {
  switch (kind) {
    case "status_changed":
      return `El estado de la publicación cambió mientras la editabas${
        currentStatusLabel ? ` (ahora: ${currentStatusLabel})` : ""
      }. No se guardó ningún cambio: cerrá y volvé a abrir la publicación para ver la versión actual.`;
    case "content_changed":
      return "Otra persona guardó cambios en esta publicación mientras la editabas. No se guardó ningún cambio: cerrá y volvé a abrir la publicación para ver la versión actual.";
    case "not_found":
      return "No se pudo guardar: publicación no encontrada o sin permisos.";
  }
}

/** Compara timestamps de Postgres sin depender del formato del string (offset, ceros, microsegundos). */
export function sameTimestamp(a: string, b: string): boolean {
  if (a === b) return true;
  const micros = (value: string): string | null => {
    const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(value.trim());
    if (!match) return null;
    const [, date, time, fraction = "", zone = "Z"] = match;
    const ms = Date.parse(`${date}T${time}${normalizeZone(zone)}`);
    if (Number.isNaN(ms)) return null;
    return `${ms / 1000}.${fraction.padEnd(6, "0")}`;
  };
  const ma = micros(a);
  return ma !== null && ma === micros(b);
}

function normalizeZone(zone: string): string {
  if (zone === "Z") return "Z";
  if (/^[+-]\d{2}$/.test(zone)) return `${zone}:00`;
  if (/^[+-]\d{4}$/.test(zone)) return `${zone.slice(0, 3)}:${zone.slice(3)}`;
  return zone;
}
