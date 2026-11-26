/**
 * Texto de la actividad de una publicación ("Comentarios y actividad"). Puro: sin React ni Supabase.
 * Solo valores NUEVOS (nunca el anterior ni diferencias de texto) y sin detalles técnicos.
 */
import { PLANNER_TIME_ZONE } from "@/lib/dashboard";
import type { PublicationActivityChanges } from "@/types";

/** Una frase del evento: la acción va en negrita; el valor nuevo (si hay), en texto normal. */
export interface ActivityPhrase {
  action: string;
  value?: string;
}

function ddmm(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  return match ? `${match[3]}/${match[2]}` : isoDate;
}

function countPhrase(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : `${count} ${plural}`;
}

export function activityPhrases(changes: PublicationActivityChanges): ActivityPhrase[] {
  if (changes.created) return [{ action: "creó la publicación" }];

  const phrases: ActivityPhrase[] = [];
  if (changes.status?.label) phrases.push({ action: "cambió el estado", value: `a ${changes.status.label}` });
  if (changes.schedule?.date) {
    const time = changes.schedule.time ? ` a las ${changes.schedule.time}` : "";
    phrases.push({ action: "cambió la fecha de publicación", value: `al ${ddmm(changes.schedule.date)}${time}` });
  }
  if (typeof changes.title === "string") phrases.push({ action: "cambió el título", value: `a «${changes.title}»` });
  if (changes.copy) phrases.push({ action: "actualizó el texto" });
  if ("content_type" in changes && changes.content_type) phrases.push({ action: "cambió el tipo", value: `a ${changes.content_type}` });
  if ("calendar" in changes && changes.calendar) phrases.push({ action: "cambió el calendario", value: `a ${changes.calendar}` });
  if ("campaign" in changes) {
    phrases.push(changes.campaign ? { action: "cambió la campaña", value: `a ${changes.campaign}` } : { action: "quitó la campaña" });
  }
  if (Array.isArray(changes.destinations)) {
    phrases.push(
      changes.destinations.length > 0
        ? {
            action: "cambió los destinos",
            value: `a ${changes.destinations.map((d) => `${d.platform} ${d.handle}`).join(", ")}`,
          }
        : { action: "quitó los destinos" }
    );
  }
  const added = changes.files_added ?? 0;
  const removed = changes.files_removed ?? 0;
  if (added > 0) phrases.push({ action: `agregó ${countPhrase(added, "un archivo", "archivos")}` });
  if (removed > 0) phrases.push({ action: `quitó ${countPhrase(removed, "un archivo", "archivos")}` });
  if (changes.cover) phrases.push({ action: "cambió la portada" });
  if (changes.files_reordered && added === 0 && removed === 0) phrases.push({ action: "reordenó los archivos" });
  if ("drive" in changes) {
    phrases.push({ action: changes.drive ? "actualizó el enlace de material" : "quitó el enlace de material" });
  }
  if ("trello" in changes) {
    phrases.push({ action: changes.trello ? "actualizó el link a Trello" : "quitó el link a Trello" });
  }
  return phrases;
}

/** "26/11/2026 · 15:42" en el huso de Planner. */
export function formatActivityTimestamp(iso: string): string {
  const parts = new Intl.DateTimeFormat("es-AR", {
    timeZone: PLANNER_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} · ${get("hour")}:${get("minute")}`;
}
