import type { CalendarStatus } from "@/types";

export const MONTH_LABELS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export const CALENDAR_STATUS_LABELS: Record<CalendarStatus, string> = {
  draft: "Borrador",
  active: "Activo",
  archived: "Archivado",
};
