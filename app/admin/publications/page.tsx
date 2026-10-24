import { format } from "date-fns";
import { redirect } from "next/navigation";
import { CalendarScreen } from "@/components/calendar/calendar-screen";
import { getMonthGridDays } from "@/lib/date-utils";
import {
  getLookups,
  listAllCampaignsAdmin,
  listAllClientAccountsAdmin,
  listCalendars,
  listClients,
  listPublicationsInRange,
} from "@/lib/supabase/queries";

// Rango inicial = la grilla del mes actual (cubre Semana/Mes/Lista de ese mes sin pedir nada más). CalendarScreen
// (modo global) amplía este rango bajo demanda al navegar afuera o ensanchar Desde/Hasta en Lista — ver
// listPublicationsInRange en lib/supabase/queries.ts.
function getInitialRange() {
  const days = getMonthGridDays(new Date());
  return { from: format(days[0], "yyyy-MM-dd"), to: format(days[days.length - 1], "yyyy-MM-dd") };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LINKED_RANGE_DAYS = 400;

/**
 * v1.6: Lista con Desde/Hasta en la URL (p. ej. los enlaces del dashboard de Inicio) carga ese rango desde el
 * primer render, además del mes actual. Sin esto, los filtros elegidos por URL (estado) se descartaban antes de
 * que llegara el período pedido, porque CalendarScreen poda los filtros contra lo ya cargado.
 */
function rangeFromSearch(base: { from: string; to: string }, search: Record<string, string | string[] | undefined>) {
  const { view, from, to } = search;
  if (view !== "list" || typeof from !== "string" || typeof to !== "string") return base;
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to) || from > to) return base;
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (!(days <= MAX_LINKED_RANGE_DAYS)) return base;
  return { from: from < base.from ? from : base.from, to: to > base.to ? to : base.to };
}

/** v1.6: ?date= (fecha de referencia persistida por el calendario) → se carga también la grilla de ese mes. */
function rangeWithDate(base: { from: string; to: string }, search: Record<string, string | string[] | undefined>) {
  const { date } = search;
  if (typeof date !== "string" || !ISO_DATE.test(date)) return base;
  const anchor = new Date(`${date}T00:00:00`);
  if (Number.isNaN(anchor.getTime())) return base;
  const days = getMonthGridDays(anchor);
  const from = format(days[0], "yyyy-MM-dd");
  const to = format(days[days.length - 1], "yyyy-MM-dd");
  return { from: from < base.from ? from : base.from, to: to > base.to ? to : base.to };
}

export default async function AdminPublicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const search = await searchParams;

  // v1.6: compatibilidad con enlaces viejos `?clients=<id>` (un solo cliente). El contexto ahora lo da la ruta: se
  // redirige al Planner de ese cliente conservando el resto de los parámetros. Solo si el cliente es visible para
  // este usuario (listClients respeta RLS); varios clientes o ids desconocidos siguen como filtro (chips) acá.
  const legacyClients = typeof search.clients === "string" ? search.clients.split(",").filter(Boolean) : [];
  if (legacyClients.length === 1) {
    const visible = (await listClients()).some((c) => c.id === legacyClients[0]);
    if (visible) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(search)) {
        if (key === "clients" || value === undefined) continue;
        for (const v of Array.isArray(value) ? value : [value]) params.append(key, v);
      }
      const query = params.toString();
      redirect(`/admin/clients/${legacyClients[0]}/planner${query ? `?${query}` : ""}`);
    }
  }

  const initialRange = rangeWithDate(rangeFromSearch(getInitialRange(), search), search);
  const [publications, clients, calendars, clientAccounts, campaigns, lookups] = await Promise.all([
    listPublicationsInRange(initialRange.from, initialRange.to),
    listClients(),
    listCalendars(),
    listAllClientAccountsAdmin(),
    listAllCampaignsAdmin(),
    getLookups(),
  ]);

  return (
    <CalendarScreen
      calendars={calendars}
      publications={publications}
      clientAccounts={clientAccounts}
      campaigns={campaigns}
      lookups={lookups}
      global={{ clients, initialRange }}
    />
  );
}
