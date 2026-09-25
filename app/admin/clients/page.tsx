import { ClientsPageClient } from "@/components/admin/clients-page-client";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, listCalendars, listClients } from "@/lib/supabase/queries";

export default async function ClientsPage() {
  const [clients, calendars, supabase, profile] = await Promise.all([
    listClients(),
    listCalendars(),
    createClient(),
    getCurrentProfile(),
  ]);
  const { data: publications } = await supabase.from("publications").select("calendar_id");

  const publicationCountByCalendarId: Record<string, number> = {};
  for (const row of publications ?? []) {
    publicationCountByCalendarId[row.calendar_id] = (publicationCountByCalendarId[row.calendar_id] ?? 0) + 1;
  }

  return (
    <ClientsPageClient
      clients={clients}
      calendars={calendars}
      publicationCountByCalendarId={publicationCountByCalendarId}
      canCreateClients={profile?.role === "super_admin"}
    />
  );
}
