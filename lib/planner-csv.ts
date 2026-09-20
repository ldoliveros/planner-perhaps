import type { Calendar, Campaign, ClientAccount, ContentType, Platform, Publication, Status } from "@/types";
import { accountLabel } from "@/lib/account-label";

/** Columnas del export del Planner, en el orden exacto del archivo. */
export const PLANNER_CSV_HEADERS = [
  "Fecha",
  "Hora",
  "Calendario",
  "Título",
  "Tipo",
  "Estado",
  "Plataformas / Destinos",
  "Cuentas",
  "Copy",
  "Campaña",
  "Carpeta de Drive",
] as const;

/** Escapa una celda según RFC 4180: comillas si tiene coma, comilla doble o salto de línea; comillas internas duplicadas. */
export function escapeCsvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Une filas en CSV (registros separados por CRLF, sin BOM). Los saltos de línea dentro de una celda se conservan. */
export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}

/** "2026-09-14" -> "14/09/2026" (sin pasar por Date: evita corrimientos por zona horaria). */
function formatCsvDate(dateIso: string): string {
  const [year, month, day] = dateIso.split("-");
  return `${day}/${month}/${year}`;
}

interface PlannerCsvLookups {
  calendars: Calendar[];
  clientAccounts: ClientAccount[];
  campaigns: Campaign[];
  contentTypes: ContentType[];
  statuses: Status[];
  platforms: Platform[];
}

/**
 * Arma el CSV del Planner: UNA fila por publicación, ordenada por fecha y hora
 * (las sin hora primero, igual que el Planner; el resto respeta el orden de origen).
 * Devuelve el texto con BOM UTF-8 para que Excel reconozca acentos, ñ y emojis.
 */
export function buildPlannerCsv(publications: Publication[], lookups: PlannerCsvLookups): string {
  const calendarById = new Map(lookups.calendars.map((c) => [c.id, c]));
  const accountById = new Map(lookups.clientAccounts.map((a) => [a.id, a]));
  const campaignById = new Map(lookups.campaigns.map((c) => [c.id, c]));
  const contentTypeById = new Map(lookups.contentTypes.map((t) => [t.id, t]));
  const statusById = new Map(lookups.statuses.map((s) => [s.id, s]));
  const platformById = new Map(lookups.platforms.map((p) => [p.id, p]));

  const sorted = [...publications].sort((a, b) => {
    if (a.publicationDate !== b.publicationDate) return a.publicationDate.localeCompare(b.publicationDate);
    return (a.publicationTime ?? "").localeCompare(b.publicationTime ?? "");
  });

  const rows = sorted.map((p) => {
    const accounts = p.destinations
      .map((d) => accountById.get(d.clientAccountId))
      .filter((a): a is ClientAccount => Boolean(a));
    const platformNames = Array.from(
      new Set(accounts.map((a) => platformById.get(a.platformId)?.name).filter((n): n is string => Boolean(n)))
    );
    const accountNames = accounts.map(accountLabel);

    return [
      formatCsvDate(p.publicationDate),
      p.publicationTime ? p.publicationTime.slice(0, 5) : "",
      calendarById.get(p.calendarId)?.name ?? "",
      p.title,
      contentTypeById.get(p.contentTypeId)?.label ?? "",
      statusById.get(p.statusId)?.label ?? "",
      platformNames.join(", "),
      accountNames.join(", "),
      p.copy,
      p.campaignId ? (campaignById.get(p.campaignId)?.name ?? "") : "",
      p.driveFolderUrl ?? "",
    ];
  });

  return `﻿${toCsv([[...PLANNER_CSV_HEADERS], ...rows])}`;
}

/** Dispara la descarga de un CSV en el navegador y libera el object URL enseguida. */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
