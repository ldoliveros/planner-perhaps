import { CalendarsPageClient } from "@/components/admin/calendars-page-client";
import { createClient } from "@/lib/supabase/server";
import { listCalendars, listClients } from "@/lib/supabase/queries";

export default async function CalendarsPage() {
  const [calendars, clients, supabase] = await Promise.all([listCalendars(), listClients(), createClient()]);
  const { data: publications } = await supabase.from("publications").select("calendar_id");

  const publicationCountByCalendarId: Record<string, number> = {};
  for (const row of publications ?? []) {
    publicationCountByCalendarId[row.calendar_id] = (publicationCountByCalendarId[row.calendar_id] ?? 0) + 1;
  }

  return (
    <CalendarsPageClient
      calendars={calendars}
      clients={clients}
      publicationCountByCalendarId={publicationCountByCalendarId}
    />
  );
}
