import { CalendarsPageClient } from "@/components/admin/calendars-page-client";
import { countActivePublicationsByCalendar, listCalendars, listClients } from "@/lib/supabase/queries";

export default async function CalendarsPage() {
  // v1.6: conteos sin archivadas (ver countActivePublicationsByCalendar).
  const [calendars, clients, publicationCountByCalendarId] = await Promise.all([
    listCalendars(),
    listClients(),
    countActivePublicationsByCalendar(),
  ]);

  return (
    <CalendarsPageClient
      calendars={calendars}
      clients={clients}
      publicationCountByCalendarId={publicationCountByCalendarId}
    />
  );
}
