/**
 * Dashboard de Inicio (v1.6) — cálculos puros, sin React ni Supabase (testeables aparte).
 * Período = un mes calendario "YYYY-MM"; "hoy" y el mes actual se resuelven en el huso de Planner
 * (America/Argentina/Buenos_Aires, el mismo de la Agenda diaria), no en el del servidor.
 */
import type { Platform, Publication, Status } from "@/types";

export const PLANNER_TIME_ZONE = "America/Argentina/Buenos_Aires";

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/** "YYYY-MM-DD" de hoy en el huso de Planner. */
export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PLANNER_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Mes válido "YYYY-MM" o el de respaldo. */
export function parseMonth(value: string | undefined | null, fallback: string): string {
  return value && MONTH_PATTERN.test(value) ? value : fallback;
}

export function shiftMonth(month: string, delta: number): string {
  const [, y, m] = MONTH_PATTERN.exec(month)!;
  const index = Number(y) * 12 + (Number(m) - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Primer y último día del mes ("YYYY-MM-DD"). */
export function monthRange(month: string): { from: string; to: string } {
  const [, y, m] = MONTH_PATTERN.exec(month)!;
  const lastDay = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}

export function formatMonthLabel(month: string): string {
  const [, y, m] = MONTH_PATTERN.exec(month)!;
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
}

export interface StatusBucket {
  statusId: string;
  key: string;
  label: string;
  color: string;
  count: number;
  /** Entero; los de todos los segmentos suman exactamente 100 (método del mayor resto). */
  percent: number;
}

/** Distribución por estado en el orden del catálogo de Planner, solo estados con publicaciones. */
export function statusDistribution(publications: Pick<Publication, "statusId">[], statuses: Status[]): StatusBucket[] {
  const counts = new Map<string, number>();
  for (const p of publications) counts.set(p.statusId, (counts.get(p.statusId) ?? 0) + 1);
  const total = publications.length;
  const buckets: StatusBucket[] = [...statuses]
    .sort((a, b) => a.order - b.order)
    .filter((s) => (counts.get(s.id) ?? 0) > 0)
    .map((s) => {
      const count = counts.get(s.id) ?? 0;
      return { statusId: s.id, key: s.key, label: s.label, color: s.color, count, percent: Math.floor((count * 100) / total) };
    });
  // Mayor resto: los puntos que faltan para 100 van a los segmentos con mayor parte decimal.
  const remainder = (b: StatusBucket) => ((b.count * 100) / total) % 1;
  let missing = 100 - buckets.reduce((sum, b) => sum + b.percent, 0);
  for (const b of [...buckets].sort((x, y) => remainder(y) - remainder(x))) {
    if (missing <= 0 || buckets.length === 0) break;
    b.percent += 1;
    missing -= 1;
  }
  return buckets;
}

/** Estados que no cuentan como "programados" para Próximas publicaciones. */
const NOT_UPCOMING_STATUS_KEYS = new Set(["published", "discarded"]);

/**
 * Próximas publicaciones del período: desde hoy (inclusive), sin publicadas ni descartadas, por fecha y hora
 * (sin hora al final del día) y título. Un período ya pasado no tiene próximas.
 */
export function upcomingPublications<T extends Pick<Publication, "publicationDate" | "publicationTime" | "title" | "statusId">>(
  publications: T[],
  statuses: Pick<Status, "id" | "key">[],
  today: string,
  limit = 5
): T[] {
  const keyById = new Map(statuses.map((s) => [s.id, s.key]));
  return publications
    .filter((p) => p.publicationDate >= today && !NOT_UPCOMING_STATUS_KEYS.has(keyById.get(p.statusId) ?? ""))
    .sort(
      (a, b) =>
        a.publicationDate.localeCompare(b.publicationDate) ||
        (a.publicationTime ?? "99:99").localeCompare(b.publicationTime ?? "99:99") ||
        a.title.localeCompare(b.title, "es")
    )
    .slice(0, limit);
}

/**
 * Publicaciones (global) en Lista con el período del dashboard, el espacio (filtro Cliente) y, opcionalmente,
 * un estado (filtro Estado; ver `?status=` en CalendarScreen). Mismos parámetros que ya entiende esa pantalla.
 */
export function publicationsListHref({ month, clientId, statusKey }: { month: string; clientId?: string | null; statusKey?: string | null }): string {
  const { from, to } = monthRange(month);
  const params = new URLSearchParams({ view: "list", from, to });
  if (statusKey) params.set("status", statusKey);
  // v1.6: un cliente puntual abre su Planner (la ruta es el contexto), no "Ver todos" con un filtro Espacio.
  return `${clientId ? `/admin/clients/${clientId}/planner` : "/admin/publications"}?${params.toString()}`;
}

// ---------------------------------------------------------------------------------------------------------------
// v1.6 — Período del Escritorio con los mismos controles del Planner: Día / Semana / Mes + fecha de referencia.
// URL: `?view=day|week|month&date=YYYY-MM-DD` (Mes y hoy se omiten). Compatibilidad: un `?month=YYYY-MM` viejo sin
// `view`/`date` se lee como ese mes.
// ---------------------------------------------------------------------------------------------------------------

export type DashboardView = "day" | "week" | "month";

const ISO_DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Fecha local (medianoche) de un "YYYY-MM-DD" ya validado. */
export function dateFromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** "YYYY-MM-DD" de una fecha local. */
export function isoFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Vista y fecha del Escritorio a partir de la URL (valores inválidos → Mes / hoy). */
export function parseDashboardPeriod(
  params: { view?: string | null; date?: string | null; month?: string | null },
  today: string
): { view: DashboardView; date: string } {
  const view: DashboardView = params.view === "day" || params.view === "week" ? params.view : "month";
  const validDate = params.date && ISO_DATE_PATTERN.test(params.date) && isoFromDate(dateFromIso(params.date)) === params.date;
  if (validDate) return { view, date: params.date! };
  if (!params.view && params.month && MONTH_PATTERN.test(params.month)) {
    return { view: "month", date: params.month === today.slice(0, 7) ? today : `${params.month}-01` };
  }
  return { view, date: today };
}

/** Primer y último día del período (semana de lunes a domingo, como el Planner). */
export function periodRange(view: DashboardView, date: string): { from: string; to: string } {
  if (view === "day") return { from: date, to: date };
  if (view === "month") return monthRange(date.slice(0, 7));
  const d = dateFromIso(date);
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return { from: isoFromDate(monday), to: isoFromDate(sunday) };
}

/** Frase del período para los textos ("este mes", "esta semana", "hoy", "en octubre 2026"…). */
export function periodNoun(view: DashboardView, date: string, today: string): string {
  const { from, to } = periodRange(view, date);
  const current = today >= from && today <= to;
  if (view === "day") return current ? "hoy" : `el ${Number(date.slice(8, 10))}/${Number(date.slice(5, 7))}`;
  if (view === "week") return current ? "esta semana" : `en la semana del ${Number(from.slice(8, 10))}/${Number(from.slice(5, 7))}`;
  return current ? "este mes" : `en ${formatMonthLabel(date.slice(0, 7)).toLowerCase()}`;
}

/**
 * Destino de los indicadores y la distribución: Mes → Publicaciones en Lista con ese mes (enlace de siempre);
 * Día / Semana → el calendario en esa vista y fecha. Con estado, `?status=` (filtro inicial del Planner).
 */
export function dashboardPeriodHref({
  view,
  date,
  clientId,
  statusKey,
}: {
  view: DashboardView;
  date: string;
  clientId?: string | null;
  statusKey?: string | null;
}): string {
  if (view === "month") return publicationsListHref({ month: date.slice(0, 7), clientId, statusKey });
  const params = new URLSearchParams({ view, date });
  if (statusKey) params.set("status", statusKey);
  return `${clientId ? `/admin/clients/${clientId}/planner` : "/admin/publications"}?${params.toString()}`;
}

export interface PlatformCount {
  key: string;
  name: string;
  color: string;
  count: number;
}

/**
 * Publicaciones por red social: cada publicación suma 1 en cada plataforma distinta de sus destinos (una con
 * Instagram y Facebook cuenta en las dos; dos cuentas de Instagram cuentan una vez). Solo plataformas con actividad,
 * de mayor a menor (empates: orden del catálogo).
 */
export function platformDistribution(
  publications: Pick<Publication, "destinations">[],
  platformIdByAccountId: Map<string, string>,
  platforms: Pick<Platform, "id" | "key" | "name" | "color">[]
): PlatformCount[] {
  const counts = new Map<string, number>();
  for (const p of publications) {
    const ids = new Set(
      p.destinations.map((d) => platformIdByAccountId.get(d.clientAccountId)).filter((id): id is string => Boolean(id))
    );
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return platforms
    .map((pl, index) => ({ pl, index, count: counts.get(pl.id) ?? 0 }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .map(({ pl, count }) => ({ key: pl.key, name: pl.name, color: pl.color, count }));
}

/** Ventana de Próximas publicaciones (independiente del período de las estadísticas). */
export const UPCOMING_WINDOW_DAYS = 90;

export function addDaysIso(iso: string, days: number): string {
  const d = dateFromIso(iso);
  return isoFromDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));
}
