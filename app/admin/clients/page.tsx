import { ClientsPageClient } from "@/components/admin/clients-page-client";
import { countActivePublicationsByCalendar, getCurrentProfile, listCalendars, listClients } from "@/lib/supabase/queries";

export default async function ClientsPage() {
  // v1.6: conteos sin archivadas (ver countActivePublicationsByCalendar).
  const [clients, calendars, profile, publicationCountByCalendarId] = await Promise.all([
    listClients(),
    listCalendars(),
    getCurrentProfile(),
    countActivePublicationsByCalendar(),
  ]);

  return (
    <ClientsPageClient
      clients={clients}
      calendars={calendars}
      publicationCountByCalendarId={publicationCountByCalendarId}
      canCreateClients={profile?.role === "super_admin"}
    />
  );
}
