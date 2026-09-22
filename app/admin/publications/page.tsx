import { format } from "date-fns";
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

export default async function AdminPublicationsPage() {
  const initialRange = getInitialRange();
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
